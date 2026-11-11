import mariadb from "mariadb";

export const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: 5,
  // COUNT(*) comes back as a BigInt otherwise, which JSON can't send
  bigIntAsNumber: true,
});

/** A failure that is safe to show the user, with the HTTP status to respond with */
export class ProcedureError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Database errors that bad input can cause
const INPUT_ERRORS: Record<number, [status: number, message: string]> = {
  1062: [409, "That already exists"],
  1292: [400, "A value is not valid"],
  1406: [400, "A value is too long"],
  1451: [409, "That is still in use"],
  1452: [400, "A referenced record doesn't exist"],
};

/**
 * Calls a stored procedure and returns its first result set.
 *
 * @param name procedure name, always a constant from our own code (it can't be a placeholder)
 * @param params values for the procedure's parameters
 * @returns the selected rows, empty if the procedure selected nothing
 * @throws ProcedureError for a SIGNAL with SQLSTATE 45xxx (xxx is the HTTP status) or bad input
 */
export async function CallProcedure<T>(name: string, params: unknown[] = []): Promise<T[]> {
  const placeholders = params.map(() => "?").join(", ");
  try {
    const result = await pool.query(`CALL \`${name}\`(${placeholders})`, params);
    return Array.isArray(result) && Array.isArray(result[0]) ? (result[0] as T[]) : [];
  } catch (err) {
    const { sqlState, sqlMessage, errno } = err as { sqlState?: string; sqlMessage?: string; errno?: number };
    const signalled = sqlState?.match(/^45(\d{3})$/);
    if (signalled) throw new ProcedureError(Number(signalled[1]), sqlMessage ?? "Request failed");

    const known = errno === undefined ? undefined : INPUT_ERRORS[errno];
    if (known) throw new ProcedureError(known[0], known[1]);
    throw err;
  }
}
