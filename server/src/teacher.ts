import { Router, type Request, type Response } from "express";
import type { TeacherUser, Role } from "@virtual-projector/shared";
import { RequireTeacher, RequireSession, type ActiveSession } from "./auth";
import { CallProcedure, ProcedureError } from "./db";

const router = Router();

router.use(RequireSession, RequireTeacher);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Calls an admin procedure as the current session. The procedure checks the caller's permissions. */
function Call<T>(res: Response, name: string, ...params: unknown[]) {
  const session: ActiveSession = res.locals.session;
  return CallProcedure<T>(name, [session.id, session.keyHash, ...params]);
}

/** A text field from a request. Missing or non-text values become "", which the procedures reject where required. */
function Text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function Uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ProcedureError(400, "Invalid user id");
  return value;
}

function SectionKey(req: Request<{ crn: string; sectionid: string }>) {
  return [req.params.crn, req.params.sectionid] as const;
}

type UserRow = Omit<TeacherUser, "has_account" | "roles"> & { has_account: number; roles: string | Role[] | null };

function ToTeacherUser(row: UserRow): TeacherUser {
  const roles = typeof row.roles === "string" ? (JSON.parse(row.roles) as Role[]) : (row.roles ?? []);
  return { ...row, has_account: Boolean(row.has_account), roles: roles.sort((a, b) => a.id - b.id) };
}

function Reply(res: Response, data?: unknown) {
  res.json({ ok: true, data });
}

/* Users */

router.get("/users", async (req, res) => {
  const role = Number(req.query.role);
  const rows = await Call<UserRow>(res, "teacher.users.list", Text(req.query.search), Number.isInteger(role) && role > 0 ? role : null);
  Reply(res, rows.map(ToTeacherUser));
});


/* Enrollments */

router.get("/classes/:crn/sections/:sectionid/students", async (req, res) => {
  const rows = await Call<UserRow>(res, "teacher.section.students", ...SectionKey(req));
  Reply(res, rows.map(ToTeacherUser));
});

router.post("/classes/:crn/sections/:sectionid/students", async (req, res) => {
  await Call(res, "teacher.enrollment.add", Uuid(req.body?.student_id), ...SectionKey(req));
  Reply(res);
});

router.delete("/classes/:crn/sections/:sectionid/students/:studentId", async (req, res) => {
  await Call(res, "teacher.enrollment.remove", Uuid(req.params.studentId), ...SectionKey(req));
  Reply(res);
});

export default router;
