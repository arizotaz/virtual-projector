import mariadb from "mariadb";

export const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: 5,
});

/**
 * Calls a stored procedure and returns its first result set.
 *
 * @param name procedure name, always a constant from our own code (it can't be a placeholder)
 * @param params values for the procedure's parameters
 * @returns the selected rows, empty if the procedure selected nothing
 */
export async function CallProcedure<T>(name: string, params: unknown[] = []): Promise<T[]> {
  const placeholders = params.map(() => "?").join(", ");
  const result = await pool.query(`CALL \`${name}\`(${placeholders})`, params);
  return Array.isArray(result) && Array.isArray(result[0]) ? (result[0] as T[]) : [];
}
