// npm run db:init: sets up the database in .env from nothing, or brings an existing one up to date.
// Creates the database if it's missing, runs the SQL files in server/db, then gives ADMIN_EMAIL a
// Super login (and DEMO_EMAIL a Student login) if those are set. Safe to re-run: it never deletes
// data, and never changes the password or roles of a user who already exists.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mariadb, { type Connection } from "mariadb";
import { HashPassword } from "../passwords";

// In order: each file builds on the ones before it
const SQL_FILES = ["schema.sql", "auth.sql", "classes.sql", "admin.sql"];
const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db");

const SUPER_ROLE_ID = 4;
const STUDENT_ROLE_ID = 1;

// Must match the COLLATE in schema.sql
const COLLATION = "utf8mb4_uca1400_ai_ci";

const Quote = (name: string) => `\`${name.replaceAll("`", "``")}\``;

/**
 * Converts tables made before the switch to COLLATION, and does nothing once they're converted.
 * MariaDB won't change the collation of a column a foreign key links, even with foreign key checks off,
 * so those keys are dropped first and put back exactly as they were afterwards.
 */
async function ConvertTables(conn: Connection) {
  const tables = (
    await conn.query<{ name: string }[]>(
      `SELECT t.TABLE_NAME AS name
         FROM information_schema.TABLES t
        WHERE t.TABLE_SCHEMA = DATABASE()
          AND t.TABLE_TYPE = 'BASE TABLE'
          AND (t.TABLE_COLLATION <> ? OR EXISTS (
                SELECT 1 FROM information_schema.COLUMNS c
                 WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME AND c.COLLATION_NAME <> ?))`,
      [COLLATION, COLLATION],
    )
  ).map((table) => table.name);
  if (tables.length === 0) return;

  // Foreign keys with a text column that start or end at a table being converted
  type Row = { tbl: string; name: string; col: string; ref: string; ref_col: string; on_update: string; on_delete: string; text: number };
  const rows = await conn.query<Row[]>(
    `SELECT k.TABLE_NAME AS tbl, k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS col,
            k.REFERENCED_TABLE_NAME AS ref, k.REFERENCED_COLUMN_NAME AS ref_col,
            r.UPDATE_RULE AS on_update, r.DELETE_RULE AS on_delete, c.COLLATION_NAME IS NOT NULL AS text
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = k.TABLE_SCHEMA AND c.TABLE_NAME = k.TABLE_NAME AND c.COLUMN_NAME = k.COLUMN_NAME
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_SCHEMA = DATABASE()
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
  );
  const keys = new Map<string, Row & { cols: string[]; refCols: string[]; hasText: boolean }>();
  for (const row of rows) {
    const id = `${row.tbl}.${row.name}`;
    const key = keys.get(id) ?? { ...row, cols: [], refCols: [], hasText: false };
    key.cols.push(row.col);
    key.refCols.push(row.ref_col);
    key.hasText ||= Boolean(row.text);
    keys.set(id, key);
  }
  const linked = [...keys.values()].filter((key) => key.hasText && (tables.includes(key.tbl) || tables.includes(key.ref)));
  const restore = linked.map(
    (key) =>
      `ALTER TABLE ${Quote(key.tbl)} ADD CONSTRAINT ${Quote(key.name)} FOREIGN KEY (${key.cols.map(Quote).join(", ")}) ` +
      `REFERENCES ${Quote(key.ref)} (${key.refCols.map(Quote).join(", ")}) ON DELETE ${key.on_delete} ON UPDATE ${key.on_update}`,
  );

  for (const key of linked) await conn.query(`ALTER TABLE ${Quote(key.tbl)} DROP FOREIGN KEY ${Quote(key.name)}`);

  let convertError: unknown = null;
  try {
    for (const table of tables) {
      await conn.query(`ALTER TABLE ${Quote(table)} CONVERT TO CHARACTER SET utf8mb4 COLLATE ${COLLATION}`);
    }
  } catch (err) {
    convertError = err;
  }

  // Put the keys back even if a conversion failed
  const notRestored: string[] = [];
  for (const statement of restore) {
    try {
      await conn.query(statement);
    } catch (err) {
      notRestored.push(`${statement};  -- ${(err as { sqlMessage?: string }).sqlMessage ?? err}`);
    }
  }
  if (notRestored.length > 0) {
    console.error(`[-] These foreign keys couldn't be put back. Fix the problem, then run them by hand:\n${notRestored.join("\n")}`);
  }
  if (convertError) throw convertError;
  if (notRestored.length > 0) throw new Error("Foreign keys are missing, see above");

  console.log(`[+] Converted ${tables.length} tables to ${COLLATION}: ${tables.join(", ")}`);
}

/**
 * Splits a SQL file into statements the way the mariadb command line does,
 * including DELIMITER lines, and ignoring delimiters inside quotes and comments.
 */
function SplitSql(sql: string): string[] {
  const statements: string[] = [];
  let delimiter = ";";
  let current = "";

  const finish = () => {
    const meaningful = current.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(--\s|#).*$/gm, "").trim();
    if (meaningful) statements.push(current.trim());
    current = "";
  };

  for (let i = 0; i < sql.length; ) {
    if (i === 0 || sql[i - 1] === "\n") {
      const directive = /^DELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i.exec(sql.slice(i, i + 64));
      if (directive) {
        finish();
        delimiter = directive[1];
        i += directive[0].length;
        continue;
      }
    }

    const ch = sql[i];
    let end = i + 1;
    if ((sql.startsWith("--", i) && /\s/.test(sql[i + 2] ?? "\n")) || ch === "#") {
      end = sql.indexOf("\n", i);
      if (end === -1) end = sql.length;
    } else if (sql.startsWith("/*", i)) {
      end = sql.indexOf("*/", i + 2);
      end = end === -1 ? sql.length : end + 2;
    } else if (ch === "'" || ch === '"' || ch === "`") {
      while (end < sql.length && sql[end] !== ch) end += sql[end] === "\\" && ch !== "`" ? 2 : 1;
      end = Math.min(end + 1, sql.length);
    } else if (sql.startsWith(delimiter, i)) {
      finish();
      i += delimiter.length;
      continue;
    }
    current += sql.slice(i, end);
    i = end;
  }
  finish();
  return statements;
}

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE } = process.env;
if (!DB_HOST || !DB_USER || !DB_DATABASE) {
  console.error("[-] DB_HOST, DB_USER and DB_DATABASE must be set in .env");
  process.exit(1);
}

const conn = await mariadb
  .createConnection({ host: DB_HOST, port: Number(DB_PORT ?? 3306), user: DB_USER, password: DB_PASSWORD, bigIntAsNumber: true })
  .catch((err: Error) => {
    console.error(`[-] Couldn't connect to ${DB_HOST} as ${DB_USER}: ${err.message}`);
    process.exit(1);
  });

try {
  // Procedures keep the sql_mode they were created with. The driver adds IGNORE_SPACE, which the
  // mariadb command line doesn't, so use the server's own default to match.
  await conn.query("SET SESSION sql_mode = @@GLOBAL.sql_mode");

  const database = `\`${DB_DATABASE.replaceAll("`", "``")}\``;
  try {
    await conn.query(`USE ${database}`);
    console.log(`[*] Using database ${DB_DATABASE}`);
  } catch (err) {
    if ((err as { errno?: number }).errno !== 1049) throw err; // 1049: unknown database
    await conn.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE ${COLLATION}`);
    await conn.query(`USE ${database}`);
    console.log(`[+] Created database ${DB_DATABASE}`);
  }

  for (const file of SQL_FILES) {
    const statements = SplitSql(readFileSync(path.join(SQL_DIR, file), "utf8"));
    for (const statement of statements) {
      try {
        await conn.query(statement);
      } catch (err) {
        const firstLine = statement.split("\n").find((line) => line.trim() && !line.trim().startsWith("--"));
        throw new Error(`${file} failed at: ${firstLine?.trim()}\n    ${(err as Error).message}`);
      }
    }
    console.log(`[+] Applied ${file} (${statements.length} statements)`);
  }
  await ConvertTables(conn);

  /** Gives an email a user and a login, unless they already have them */
  const SeedLogin = async (label: string, email: string | undefined, password: string | undefined, first: string, roleId: number) => {
    if (!email || !password) {
      console.log(`[*] ${label}: skipped, its email and password aren't both set in .env`);
      return;
    }

    let [user] = await conn.query<{ id: string }[]>("SELECT id FROM users WHERE email = ?", [email]);
    if (!user) {
      await conn.beginTransaction();
      await conn.query("INSERT INTO users (first_name, last_name, email) VALUES (?, 'User', ?)", [first, email]);
      await conn.query("INSERT INTO user_roles (userid, roleid) SELECT id, ? FROM users WHERE email = ?", [roleId, email]);
      await conn.commit();
      console.log(`[+] ${label}: created user ${email}`);
    }

    const [account] = await conn.query<unknown[]>("SELECT 1 FROM accounts a JOIN users u ON u.id = a.userid WHERE u.email = ?", [email]);
    if (account) {
      console.log(`[*] ${label}: ${email} already has a login, password left unchanged`);
      return;
    }
    const [[created]] = await conn.query<{ success: unknown; message: string }[][]>("CALL `account.create`(?, ?)", [
      email,
      await HashPassword(password),
    ]);
    if (!created?.success) throw new Error(`${label}: ${created?.message}`);
    console.log(`[+] ${label}: ${email} can now log in`);
  };

  await SeedLogin("Admin", process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, "Admin", SUPER_ROLE_ID);
  await SeedLogin("Demo", process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD, "Demo", STUDENT_ROLE_ID);

  console.log("[+] Database is ready");
} catch (err) {
  console.error(`[-] ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await conn.end();
}
