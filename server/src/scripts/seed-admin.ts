// Gives the existing ADMIN_EMAIL user a login, using ADMIN_PASSWORD from .env
import { HashPassword } from "../auth";
import { CallProcedure, pool } from "../db";

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

try {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must both be set");
  }

  const [result] = await CallProcedure<{ success: unknown; message: string }>("account.create", [
    ADMIN_EMAIL,
    await HashPassword(ADMIN_PASSWORD),
  ]);
  console.log(result?.message);
  if (!result?.success) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
