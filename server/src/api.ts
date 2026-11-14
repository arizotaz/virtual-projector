import cookieParser from "cookie-parser";
import express, { Router, type CookieOptions, type NextFunction, type Request, type Response } from "express";
import {
  GetActiveSession,
  Login,
  Logout,
  RequireSession,
  SESSION_ID_COOKIE,
  SESSION_KEY_COOKIE,
  SESSION_LIFETIME_SECONDS,
  type ActiveSession,
} from "./auth";
import adminRouter from "./admin";
import { CallProcedure, pool, ProcedureError } from "./db";
import { ADMIN_ROLE_ID, STUDENT_ROLE_ID, TEACHER_ROLE_ID, type ClassInfo } from "@virtual-projector/shared";

// Lets anyone watch a class stream without logging in. Only "true" turns it on, so a typo leaves it off.
const ANONYMOUS_CLIENTS = process.env.ANONYMOUS_CLIENTS?.trim().toLowerCase() === "true";
if (ANONYMOUS_CLIENTS) console.log("[*] ANONYMOUS_CLIENTS is on: class streams can be watched without logging in");

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
 * Who gets the host page. With anonymous viewing on, that's only the section's own teacher and admins.
 */
function CanHost(session: ActiveSession | null, isLecturer: boolean): boolean {
  const level = Math.max(0, ...(session?.user.roles.map((role) => role.id) ?? []));
  return ANONYMOUS_CLIENTS ? isLecturer || level >= ADMIN_ROLE_ID : level >= TEACHER_ROLE_ID;
}

/**
 * Finds the class at /c/{department}/{shorthand}, and whether this visitor hosts or views it
 */
router.get("/classes/:department/:shorthand", async (req, res) => {
  const session = await GetActiveSession(req);
  if (!session && !ANONYMOUS_CLIENTS) {
    res.status(401).json({ ok: false, error: "Not logged in" });
    return;
  }

  const { department, shorthand } = req.params;
  type ClassRow = Omit<ClassInfo, "can_host"> & { is_lecturer: number };
  const [found] = session
    ? await CallProcedure<ClassRow>("class.find", [session.id, session.keyHash, department, shorthand])
    : await CallProcedure<ClassRow>("class.findAnonymous", [department, shorthand]);

  const { is_lecturer, ...info } = found;
  const classInfo: ClassInfo = { ...info, can_host: CanHost(session, Boolean(is_lecturer)) };
  res.json({ ok: true, class: classInfo });
});


async function GetEnrollments(session: ActiveSession | null) {
    if (!session) return [];

    type EnrolledSection = { name: string; department: string; shorthand: string | null };
    let isStudent = session.user.roles.some(r => r.id === STUDENT_ROLE_ID);
    let isTeacher = session.user.roles.some(r => r.id === TEACHER_ROLE_ID);
    let isAdmin   = session.user.roles.some(r => r.id >=  ADMIN_ROLE_ID);

    const level = Math.max(0, ...(session?.user.roles.map((role) => role.id) ?? []));

    let rows = [];
    if (isStudent) {
        rows = await pool.query<EnrolledSection[]>(
            `SELECT c.name, s.department, s.shorthand
            FROM enrollments e
            JOIN sections s ON s.crn = e.crn AND s.sectionid = e.sectionid
            JOIN classes c  ON c.crn = s.crn
            WHERE e.studentid = ?`,
            [session.user.id],
        );
    } else if (isTeacher) {
        rows = await pool.query<EnrolledSection[]>(
            `SELECT c.name, s.department, s.shorthand
            FROM sections s
            JOIN classes c ON c.crn = s.crn
            WHERE s.lecturer = ?`,
            [session.user.id],
        );
    }
    console.log(`[!] ${session.user.id} (max_role:${level}) :`, rows);
    return rows;
}
router.get("/my-classes", async (req, res) => {
  const session = await GetActiveSession(req);
  if (!session && !ANONYMOUS_CLIENTS) {
    res.status(401).json({ ok: false, error: "Not logged in" });
    return;
  }

  res.json({ ok: true, classes: await GetEnrollments(session) });
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
