import { Router, type Request, type Response } from "express";
import type { AdminClass, AdminSection, AdminStats, AdminUser, Role } from "@virtual-projector/shared";
import { HashPassword, RequireAdmin, RequireSession, type ActiveSession } from "./auth";
import { CallProcedure, ProcedureError } from "./db";

const router = Router();

router.use(RequireSession, RequireAdmin);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD_LENGTH = 8;

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

/** Hashes a password from a request. The procedures only ever see the hash. */
function HashNewPassword(value: unknown): Promise<string> {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH || value.length > 1024) {
    throw new ProcedureError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return HashPassword(value);
}

type UserRow = Omit<AdminUser, "has_account" | "roles"> & { has_account: number; roles: string | Role[] | null };

function ToAdminUser(row: UserRow): AdminUser {
  const roles = typeof row.roles === "string" ? (JSON.parse(row.roles) as Role[]) : (row.roles ?? []);
  return { ...row, has_account: Boolean(row.has_account), roles: roles.sort((a, b) => a.id - b.id) };
}

function Reply(res: Response, data?: unknown) {
  res.json({ ok: true, data });
}

/* Overview */

router.get("/stats", async (_req, res) => {
  const [stats] = await Call<AdminStats>(res, "admin.stats");
  Reply(res, stats);
});

router.get("/roles", async (_req, res) => {
  Reply(res, await Call<Role>(res, "admin.roles.list"));
});

/* Users */

router.get("/users", async (req, res) => {
  const role = Number(req.query.role);
  const rows = await Call<UserRow>(res, "admin.users.list", Text(req.query.search), Number.isInteger(role) && role > 0 ? role : null);
  Reply(res, rows.map(ToAdminUser));
});

router.post("/users", async (req, res) => {
  const { first_name, middle_initial, last_name, email, role_id, password } = req.body ?? {};
  const [created] = await Call<{ id: string }>(
    res,
    "admin.user.create",
    Text(first_name),
    Text(middle_initial),
    Text(last_name),
    Text(email),
    Number.isInteger(role_id) ? role_id : null,
    password ? await HashNewPassword(password) : null,
  );
  Reply(res, created);
});

router.get("/users/:id", async (req, res) => {
  const [user] = await Call<UserRow>(res, "admin.user.get", Uuid(req.params.id));
  Reply(res, user && ToAdminUser(user));
});

router.put("/users/:id", async (req, res) => {
  const { first_name, middle_initial, last_name, email } = req.body ?? {};
  await Call(res, "admin.user.update", Uuid(req.params.id), Text(first_name), Text(middle_initial), Text(last_name), Text(email));
  Reply(res);
});

router.delete("/users/:id", async (req, res) => {
  await Call(res, "admin.user.delete", Uuid(req.params.id));
  Reply(res);
});

router.get("/users/:id/enrollments", async (req, res) => {
  Reply(res, await Call<AdminSection>(res, "admin.user.enrollments", Uuid(req.params.id)));
});

router.get("/users/:id/teaching", async (req, res) => {
  Reply(res, await Call<AdminSection>(res, "admin.user.teaching", Uuid(req.params.id)));
});

router.post("/users/:id/roles", async (req, res) => {
  await Call(res, "admin.user.addRole", Uuid(req.params.id), Number(req.body?.role_id));
  Reply(res);
});

router.delete("/users/:id/roles/:roleId", async (req, res) => {
  await Call(res, "admin.user.removeRole", Uuid(req.params.id), Number(req.params.roleId));
  Reply(res);
});

/* Accounts */

router.post("/users/:id/account", async (req, res) => {
  const id = Uuid(req.params.id);
  await Call(res, "admin.account.create", id, await HashNewPassword(req.body?.password));
  Reply(res);
});

router.put("/users/:id/account", async (req, res) => {
  const id = Uuid(req.params.id);
  await Call(res, "admin.account.setPassword", id, await HashNewPassword(req.body?.password));
  Reply(res);
});

router.delete("/users/:id/account", async (req, res) => {
  await Call(res, "admin.account.delete", Uuid(req.params.id));
  Reply(res);
});

/* Classes */

router.get("/classes", async (req, res) => {
  Reply(res, await Call<AdminClass>(res, "admin.classes.list", Text(req.query.search)));
});

router.post("/classes", async (req, res) => {
  await Call(res, "admin.class.create", Text(req.body?.crn), Text(req.body?.name));
  Reply(res);
});

router.get("/classes/:crn", async (req, res) => {
  const [found] = await Call<Pick<AdminClass, "crn" | "name">>(res, "admin.class.get", req.params.crn);
  Reply(res, found);
});

router.put("/classes/:crn", async (req, res) => {
  await Call(res, "admin.class.update", req.params.crn, Text(req.body?.name));
  Reply(res);
});

router.delete("/classes/:crn", async (req, res) => {
  await Call(res, "admin.class.delete", req.params.crn);
  Reply(res);
});

/* Sections */

/** Every section, for choosing one when enrolling a student */
router.get("/sections", async (_req, res) => {
  Reply(res, await Call<AdminSection>(res, "admin.sections.list", null, null));
});

router.get("/classes/:crn/sections", async (req, res) => {
  Reply(res, await Call<AdminSection>(res, "admin.sections.list", req.params.crn, null));
});

router.post("/classes/:crn/sections", async (req, res) => {
  await Call(res, "admin.section.create", req.params.crn, Text(req.body?.sectionid), Uuid(req.body?.lecturer));
  Reply(res);
});

function SectionKey(req: Request<{ crn: string; sectionid: string }>) {
  return [req.params.crn, req.params.sectionid] as const;
}

router.get("/classes/:crn/sections/:sectionid", async (req, res) => {
  const [section] = await Call<AdminSection>(res, "admin.sections.list", ...SectionKey(req));
  if (!section) throw new ProcedureError(404, "Section not found");
  Reply(res, section);
});

router.delete("/classes/:crn/sections/:sectionid", async (req, res) => {
  await Call(res, "admin.section.delete", ...SectionKey(req));
  Reply(res);
});

router.put("/classes/:crn/sections/:sectionid/teacher", async (req, res) => {
  await Call(res, "admin.section.setTeacher", ...SectionKey(req), Uuid(req.body?.lecturer));
  Reply(res);
});

router.put("/classes/:crn/sections/:sectionid/url", async (req, res) => {
  await Call(res, "admin.section.setUrl", ...SectionKey(req), Text(req.body?.department), Text(req.body?.classname));
  Reply(res);
});

/* Enrollments */

router.get("/classes/:crn/sections/:sectionid/students", async (req, res) => {
  const rows = await Call<UserRow>(res, "admin.section.students", ...SectionKey(req));
  Reply(res, rows.map(ToAdminUser));
});

router.post("/classes/:crn/sections/:sectionid/students", async (req, res) => {
  await Call(res, "admin.enrollment.add", Uuid(req.body?.student_id), ...SectionKey(req));
  Reply(res);
});

router.delete("/classes/:crn/sections/:sectionid/students/:studentId", async (req, res) => {
  await Call(res, "admin.enrollment.remove", Uuid(req.params.studentId), ...SectionKey(req));
  Reply(res);
});

export default router;
