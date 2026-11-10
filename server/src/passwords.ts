// Password hashing, kept apart from auth.ts so scripts can hash without opening the database pool
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

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
