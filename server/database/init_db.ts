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

async function CreateUser(user: {
    firstName: string,
    middleInitial: string,
    lastName: string,
    email: string,
    password: string,
    role: number
}) {
    try {
        const password_hash = createHash("sha256")
            .update(user.password)
            .digest("hex");

        await db.insert(users).ignore().values({
            firstName: user.firstName,
            middleInitial: user.middleInitial,
            lastName: user.lastName,
            email: user.email,
            password_hash: password_hash,
        });
        
        const [insertedUser] = await db.select({ uid: users.id })
            .from(users).where(eq(
                users.email, user.email
            )).limit(1);
        await db.insert(userRoles).ignore().values({
            userid: insertedUser.uid,
            roleid: user.role
        });

        console.log(`[+] Added User: ${user.email} :: ${user.role}`)
    } catch (e) {
        console.error("[USER-INSERT Err]", e);
    }
}

try {
    // Apply generated SQL migrations from ./drizzle
    await migrate(db, { migrationsFolder: './drizzle' });

    // Seed fixed role IDs (idempotent)
    await db.insert(roles).ignore().values([
        { id: 1, name: 'Student' },
        { id: 2, name: 'Teacher' },
        { id: 3, name: 'Administrator' },
        { id: 4, name: 'Super' },
    ]);

    // insert administrator
    const admin_username = process.env.ADMIN_USER;
    const admin_email = process.env.ADMIN_EMAIL;
    const admin_password = process.env.ADMIN_PASSWORD;
    
    const defaultUsers = [
        {
            firstName: "Roy",
            middleInitial: "E",
            lastName: "Heath",
            email: admin_email,
            password: admin_password,
            role: 4 // super admin (cannot be removed)
        },
    ]
    for (const user of defaultUsers) {
        await CreateUser(user);
    }

    console.log('Database initialized');
} finally {
    await pool.end();
}