import cookieParser from "cookie-parser";
import express, { Router, type CookieOptions, type NextFunction, type Request, type Response } from "express";
import {
  Login,
  Logout,
  RequireSession,
  SESSION_ID_COOKIE,
  SESSION_KEY_COOKIE,
  SESSION_LIFETIME_SECONDS,
  type ActiveSession,
} from "./auth";
import adminRouter from "./admin";
import { CallProcedure, ProcedureError } from "./db";
import type { ClassInfo } from "@virtual-projector/shared";

const router = Router()

router.use(express.json());
router.use(cookieParser());

// JS can't read these cookies. "secure" follows the request so plain-HTTP deployments can still log in.
function CookieOptionsFor(req: Request): CookieOptions {
  return { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/" };
}


/**
 * Simple api call to test if the server is available
 */
router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * Checks an email and password, then sets the session cookies
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 100 || password.length > 1024) {
    res.status(400).json({ ok: false, error: "Email and password are required" });
    return;
  }

  const login = await Login(email, password, req.ip);
  if (!login) {
    res.status(401).json({ ok: false, error: "Incorrect email or password" });
    return;
  }

  const options = { ...CookieOptionsFor(req), maxAge: SESSION_LIFETIME_SECONDS * 1000 };
  res.cookie(SESSION_ID_COOKIE, login.sessionID, options);
  res.cookie(SESSION_KEY_COOKIE, login.sessionKey, options);
  res.json({ ok: true, user: login.user });
});

/**
 * Ends the current session and clears its cookies
 */
router.post("/logout", async (req, res) => {
  const sessionID: unknown = req.cookies?.[SESSION_ID_COOKIE];
  const sessionKey: unknown = req.cookies?.[SESSION_KEY_COOKIE];
  if (typeof sessionID === "string" && typeof sessionKey === "string" && sessionID.length <= 256) {
    await Logout(sessionID, sessionKey);
  }

  res.clearCookie(SESSION_ID_COOKIE, CookieOptionsFor(req));
  res.clearCookie(SESSION_KEY_COOKIE, CookieOptionsFor(req));
  res.json({ ok: true });
});

/**
 * Returns the logged in user
 */
router.get("/session", RequireSession, (_req, res) => {
  const session: ActiveSession = res.locals.session;
  res.json({ ok: true, user: session.user });
});

/**
 * Finds the class at /c/{department}/{shorthand}
 */
router.get("/classes/:department/:shorthand", RequireSession, async (req, res) => {
  const session: ActiveSession = res.locals.session;
  const [found] = await CallProcedure<ClassInfo>("class.find", [
    session.id,
    session.keyHash,
    req.params.department,
    req.params.shorthand,
  ]);
  res.json({ ok: true, class: found });
});

router.use("/admin", adminRouter);

// Malformed requests keep their status; anything else is logged here and not sent to the client
router.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error("[api]", err);
  const message = err instanceof ProcedureError ? err.message : status >= 500 ? "Server error" : "Bad request";
  res.status(status).json({ ok: false, error: message });
});


export default router;
