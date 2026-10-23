import "dotenv/config";
import { createHash } from "node:crypto";

import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { eq } from 'drizzle-orm';

import { users, userRoles, roles } from './schema.ts';

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

    // insert administrator
    const admin_username = process.env.ADMIN_USER;
    const admin_email = process.env.ADMIN_EMAIL;
    const admin_password = process.env.ADMIN_PASSWORD;
    const password_hash = createHash("sha256")
        .update(admin_password)
        .digest("hex");

    await db.insert(users).ignore().values({
        firstName: "Roy",
        middleInitial: "E",
        lastName: "Sampson",
        email: admin_email,
        password_hash: password_hash,
    });
    
    // assign default admin user a role
    const [royAdmin] = await db.select({ uid: users.id })
        .from(users).where(eq(
            users.email, admin_email
        )).limit(1);
    await db.insert(userRoles).ignore().values({
        userid: royAdmin.uid,
        roleid: 3 // administrator
    });

    console.log('Database initialized');
} finally {
    await pool.end();
}