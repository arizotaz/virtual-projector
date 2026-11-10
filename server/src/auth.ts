import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ADMIN_ROLE_ID, type AuthUser } from "@virtual-projector/shared";
import { CallProcedure } from "./db";
import { HashPassword, VerifyPassword } from "./passwords";

export { HashPassword };

export const SESSION_ID_COOKIE = "sessionID";
export const SESSION_KEY_COOKIE = "sessionKey";
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

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

/** The request's session, or null if it has no valid one. */
export async function GetActiveSession(req: Request): Promise<ActiveSession | null> {
  const sessionID: unknown = req.cookies?.[SESSION_ID_COOKIE];
  const sessionKey: unknown = req.cookies?.[SESSION_KEY_COOKIE];
  if (typeof sessionID !== "string" || typeof sessionKey !== "string" || sessionID.length > 256) return null;

  const keyHash = HashSessionKey(sessionKey);
  const user = await GetUserData(sessionID, keyHash);
  return user && { id: sessionID, keyHash, user };
}

/**
 * Middleware for routes that need a logged in user. Responds 401 without one,
 * otherwise puts the session on res.locals.session as an ActiveSession.
 */
export async function RequireSession(req: Request, res: Response, next: NextFunction) {
  const session = await GetActiveSession(req);
  if (session) {
    res.locals.session = session;
    return next();
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
