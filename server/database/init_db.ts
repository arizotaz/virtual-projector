import "dotenv/config";

import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { roles } from './schema.ts';

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
const db = drizzle({ client: pool });

try {
    // Apply generated SQL migrations from ./drizzle
    await migrate(db, { migrationsFolder: './drizzle' });

    // Seed fixed role IDs (idempotent)
    await db.insert(roles).ignore().values([
        { id: 1, name: 'Student' },
        { id: 2, name: 'Teacher' },
        { id: 3, name: 'Administrator' },
    ]);

    console.log('Database initialized');
} finally {
    await pool.end();
}