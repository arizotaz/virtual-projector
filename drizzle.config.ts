import { defineConfig } from 'drizzle-kit';

const dbu = process.env.DB_USER;
const passwd = process.env.DB_PASSWORD;
const dbname = process.env.DB_DATABASE;
const dbhost = process.env.DB_HOST;

if (!dbu || !passwd || !dbname || !dbhost) {
    throw new Error(
        "Missing database environment variables: DB_USER, DB_PASSWORD, DB_DATABASE, DB_HOST"
    );
}
const url = `mysql://${encodeURIComponent(dbu)}:${encodeURIComponent(passwd)}@${dbhost}:3306/${dbname}`;

export default defineConfig({
    dialect: 'mysql', // also used for MariaDB
    schema: './server/database/schema.ts',
    out: './drizzle',
    dbCredentials: { url },
});