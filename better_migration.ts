import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import "dotenv/config";

const dbu = process.env.DB_USER;
const passwd = process.env.DB_PASSWORD;
const dbname = process.env.DB_DATABASE;
const dbhost = process.env.DB_HOST;

if (!dbu || !passwd || !dbname || !dbhost) {
    throw new Error(
        "Missing database environment variables: DB_USER, DB_PASSWORD, DB_DATABASE, DB_HOST"
    );
}
const url = `mysql://${encodeURIComponent(dbu)}:${encodeURIComponent(passwd)}@${dbhost}:3306/${dbname}`;

const pool = mysql.createPool(url);

console.log({
    host: dbhost,
    database: dbname,
    user: dbu,
});

try {
    const [rows] = await pool.query(
        "SELECT DATABASE() AS db, @@hostname AS host, @@port AS port"
    );
    console.log("Migration database connection:", rows);

    await migrate(drizzle(pool), {
        migrationsFolder: "./drizzle"
    });
    console.log("[+] Migrations Applied");
} catch (e) {
    console.error("[-] Migrations Failed!");
    console.error(e);
    process.exitCode = 1;
} finally {
    await pool.end();
}