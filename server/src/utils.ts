import {
    createHash, randomBytes, scryptSync,
    createCipheriv, createDecipheriv,
} from "node:crypto";

/**
 * @todo - Run the code below periodically to clear expired sessions from the DB
 * 
 * await db.delete(schema.sessions).where(lt(schema.sessions.expiration, new Date()));
 */

import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and } from "drizzle-orm";
import mysql from 'mysql2/promise';
import * as schema from '../database/schema';

const dbu = process.env.DB_USER;
const passwd = process.env.DB_PASSWORD;
const dbname = process.env.DB_DATABASE;
const dbhost = process.env.DB_HOST;

const url = `mysql://${encodeURIComponent(dbu)}:${encodeURIComponent(passwd)}@${dbhost}:3306/${dbname}`;
const pool = mysql.createPool(url);
const db = drizzle({ client: pool });

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const randomToken = (bytes = 32) => randomBytes(bytes).toString("hex");

function str2sha256(value: string) {
    return createHash("sha256")
        .update(value)
        .digest("hex");
}

const cookie_sec = process.env.COOKIE_SECRET;
if (!cookie_sec) throw new Error("COOKIE_SEC is not set");

const roles: Record<number, string> = {
    0: "Unknown",
    1: "Student",
    2: "Teacher",
    3: "Administrator",
};

// Derive a key for AES methods below
const KEY = scryptSync(cookie_sec, "session-cookie-v1", 32);

/** AES-256-GCM */
function encrypt(sessionID: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", KEY, iv);
    const ct = Buffer.concat([cipher.update(sessionID, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}
function decrypt(token: string): string | null {
    try {
        const buf = Buffer.from(token, "base64url");
        if (buf.length < 12 + 16 + 1) return null;
        const decipher = createDecipheriv("aes-256-gcm", KEY, buf.subarray(0, 12));
        decipher.setAuthTag(buf.subarray(12, 28));
        return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
}

async function getUserBySession(sid: string) {
    try {
        if (!sid) return undefined;
        const sessid = decrypt(sid);
        if (!sessid) return undefined;

        const [row] = await db.select({
            id: schema.users.id,
            firstName: schema.users.firstName,
            middleInitial: schema.users.middleInitial,
            lastName: schema.users.lastName,
            email: schema.users.email,
            roleId: schema.userRoles.roleid,        // number | null (left join)
            expiration: schema.sessions.expiration,
        })
            .from(schema.sessions)
            .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userid))
            .leftJoin(schema.userRoles, eq(schema.userRoles.userid, schema.users.id))
            .where(eq(schema.sessions.sessionID, sessid))
            .limit(1);

        if (!row) return undefined;
        if (row.expiration.getTime() <= Date.now()) return undefined;

        // strip the join-only fields, resolve numeric roleId via the roles map
        const { roleId, expiration, ...user } = row;

        console.log(`[!] ${user.email} :: ${roleId}`);

        return { ...user, role: roles[roleId ?? 0] };
    } catch (e) {
        console.error(`[UserBySess Err]`, e);
        return undefined;
    }
}

async function sessionValidation(cookie: string | undefined): Promise<boolean> {
    if (!cookie) return false;

    const sessionID = decrypt(cookie);
    if (!sessionID) return false;

    try {
        const [session] = await db
            .select({ expiration: schema.sessions.expiration })
            .from(schema.sessions)
            .where(eq(schema.sessions.sessionID, sessionID))
            .limit(1);

        if (!session) return false;

        if (session.expiration.getTime() <= Date.now()) {
            // Expired: remove it
            await db.delete(schema.sessions)
                .where(eq(schema.sessions.sessionID, sessionID));
            return false;
        }

        return true;
    } catch (e) {
        console.error(`[SESSION Err]`, e);
        return false; // fail closed
    }
}

/**
 * 
 * @param sid value of req.cookies.sid from express endpoint
 * @returns 
 */
export async function GetInfo(sid: string) {
    try {
        if (!await sessionValidation(sid))
            return undefined;
        const user = await getUserBySession(sid);
        return user;
    } catch (e) {
        console.error("[GetInfo Err]", e);
        return undefined;
    }
}

export async function Login(email: string, password: string, ipAddress?: string) {
    try {
        const rows = await db.select({ id: schema.users.id }).from(schema.users).where(
            and(
                eq(schema.users.email, email),
                eq(schema.users.password_hash, str2sha256(password))
            )
        ).limit(1);

        if (rows.length === 0) {
            return {
                token: "",
                ret: {
                    "success": false,
                    "message": "Incorrect Email or Password"
                }
            }
        }

        const sessionID = randomToken();
        await db.insert(schema.sessions).values({
            sessionID,
            sessionKey: randomToken(),
            userid: rows[0].id,
            expiration: new Date(Date.now() + SESSION_TTL_MS),
            ipAddress,
        });

        return {
            token: encrypt(sessionID),
            ret: {
                "success": true,
                "message": "Login Successful!"
            }
        }
    } catch (e) {
        console.error(`[LOGIN Err]`, e)
        return {
            token: "",
            ret: {
                "success": false,
                "message": "Server Error"
            }
        }
    }
}