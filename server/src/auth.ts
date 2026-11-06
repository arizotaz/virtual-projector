import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ADMIN_ROLE_ID, type AuthUser } from "@virtual-projector/shared";
import { CallProcedure } from "./db";

export const SESSION_ID_COOKIE = "sessionID";
export const SESSION_KEY_COOKIE = "sessionKey";
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

// scrypt cost: N = 2^17, r = 8, p = 1. Stored with each hash so it can be raised later.
const SCRYPT_LOG_N = 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;

function DeriveKey(password: string, salt: Buffer, options: ScryptOptions, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Hashes a password into the string stored in accounts.password */
export async function HashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await DeriveKey(
    password,
    salt,
    { N: 2 ** SCRYPT_LOG_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY },
    SCRYPT_KEY_LENGTH,
  );
  return ["scrypt", SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

/** Checks a password against a stored hash. A malformed hash never matches. */
export async function VerifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;

  const expected = Buffer.from(key, "base64");
  const actual = await DeriveKey(
    password,
    Buffer.from(salt, "base64"),
    { N: 2 ** Number(logN), r: Number(r), p: Number(p), maxmem: SCRYPT_MAX_MEMORY },
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}

// Checked when an email has no account, so response time doesn't reveal which emails do
const dummyPasswordHash = HashPassword(randomBytes(32).toString("hex"));

/** Session keys are long and random, so a fast hash is enough */
function HashSessionKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

interface UserDataRow {
  id: string;
  name: string;
  initial_first: string;
  email: string;
  permid: number | null;
  perm_name: string | null;
}

/** Looks up a session's user. Returns null if the session is invalid or expired. */
async function GetUserData(sessionID: string, keyHash: string): Promise<AuthUser | null> {
  const rows = await CallProcedure<UserDataRow>("session.getUserData", [sessionID, keyHash]);
  const first = rows[0];
  if (!first) return null;

  return {
    id: first.id,
    name: first.name,
    initial: first.initial_first,
    email: first.email,
    roles: rows.flatMap((row) =>
      row.permid === null || row.perm_name === null ? [] : [{ id: row.permid, name: row.perm_name }],
    ),
  };
}

/**
 * Checks an email and password and creates a session.
 *
 * @returns the user and the raw session cookies, or null if the login was rejected.
 *          A user with no accounts row has no credentials to check, so is always rejected.
 */
export async function Login(email: string, password: string, ipAddress: string | undefined) {
  const [account] = await CallProcedure<{ userid: string; password: string }>("account.getCredentials", [email]);
  const passwordMatches = await VerifyPassword(password, account?.password ?? (await dummyPasswordHash));
  if (!account || !passwordMatches) return null;

  const sessionID = randomBytes(128).toString("hex"); // 256 characters
  const sessionKey = randomBytes(32).toString("hex");
  const keyHash = HashSessionKey(sessionKey);

  const [created] = await CallProcedure<{ success: unknown; message: string }>("session.create", [
    sessionID,
    keyHash,
    account.userid,
    SESSION_LIFETIME_SECONDS,
    ipAddress?.slice(0, 40) ?? null,
  ]);
  if (!created?.success) throw new Error(`session.create failed: ${created?.message}`);

  const user = await GetUserData(sessionID, keyHash);
  if (!user) throw new Error("New session could not be read back");

  return { user, sessionID, sessionKey };
}

/** Ends a session. Does nothing if the sessionID and key don't match. */
export async function Logout(sessionID: string, sessionKey: string): Promise<void> {
  await CallProcedure("session.delete", [sessionID, HashSessionKey(sessionKey)]);
}

export interface ActiveSession {
  /** Pass id and keyHash straight to any procedure that takes a session */
  id: string;
  keyHash: string;
  user: AuthUser;
}

/**
 * Middleware for routes that need a logged in user. Responds 401 without one,
 * otherwise puts the session on res.locals.session as an ActiveSession.
 */
export async function RequireSession(req: Request, res: Response, next: NextFunction) {
  const sessionID: unknown = req.cookies?.[SESSION_ID_COOKIE];
  const sessionKey: unknown = req.cookies?.[SESSION_KEY_COOKIE];

  if (typeof sessionID === "string" && typeof sessionKey === "string" && sessionID.length <= 256) {
    const keyHash = HashSessionKey(sessionKey);
    const user = await GetUserData(sessionID, keyHash);
    if (user) {
      res.locals.session = { id: sessionID, keyHash, user } satisfies ActiveSession;
      return next();
    }
  }

  res.status(401).json({ ok: false, error: "Not logged in" });
}

/**
 * Middleware for admin routes, used after RequireSession. The admin procedures check this
 * themselves too; this just rejects non-admins before any work, such as hashing a password.
 */
export function RequireAdmin(_req: Request, res: Response, next: NextFunction) {
  const session: ActiveSession = res.locals.session;
  if (session.user.roles.some((role) => role.id >= ADMIN_ROLE_ID)) return next();
  res.status(403).json({ ok: false, error: "Permission denied" });
}
