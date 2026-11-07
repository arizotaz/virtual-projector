// npm run db:init: sets up the database in .env from nothing, or brings an existing one up to date.
// Creates the database if it's missing, runs the SQL files in server/db, then gives ADMIN_EMAIL a
// Super login (and DEMO_EMAIL a Student login) if those are set. Safe to re-run: it never deletes
// data, and never changes the password or roles of a user who already exists.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mariadb from "mariadb";

// In order: each file builds on the ones before it
const SQL_FILES = ["schema.sql", "auth.sql", "classes.sql", "admin.sql"];
const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db");

const SUPER_ROLE_ID = 4;
const STUDENT_ROLE_ID = 1;

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
    await conn.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
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

  // Imported only now: it opens a pool on DB_DATABASE, which might not have existed before
  const { HashPassword } = await import("../auth");
  const { pool } = await import("../db");

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

  try {
    await SeedLogin("Admin", process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, "Admin", SUPER_ROLE_ID);
    await SeedLogin("Demo", process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD, "Demo", STUDENT_ROLE_ID);
  } finally {
    await pool.end();
  }

  console.log("[+] Database is ready");
} catch (err) {
  console.error(`[-] ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await conn.end();
}
