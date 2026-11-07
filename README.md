# virtual-projector

TypeScript monorepo (npm workspaces):

| Folder    | What it is                                                      |
| --------- | --------------------------------------------------------------- |
| `client/` | React + Vite frontend                                           |
| `server/` | Node web server: Express + Socket.IO                            |
| `shared/` | Types shared by both sides (e.g. the Socket.IO event contracts) |

## Requirements

Node 22+ (see `.nvmrc`) and npm.

## Getting started

Create a `.env` in the repo root (see [Database](#database)), then:

```bash
npm install
npm run db:init
npm run dev
```

Open http://localhost:5173. The Vite dev server hot-reloads the React app and proxies `/api` and `/socket.io` to the backend on port 4000, which restarts automatically when server code changes.

## Scripts (run from the repo root)

| Command             | Does                                                         |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Run the server and client together in watch mode             |
| `npm run build`     | Build the client (`client/dist`) and server (`server/dist`)  |
| `npm start`         | Run the production server; it also serves the built client   |
| `npm run typecheck` | Type-check every workspace                                   |
| `npm run db:init`   | Create or update the database in `.env` (see below)          |

Add a dependency to one package with `npm install <pkg> -w client` (or `-w server`).

## Database

The server needs MariaDB 10.11 or newer. It reads these from the root `.env`:

| Variable                         | What it is                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| `DB_HOST`, `DB_PORT`             | Database server (`DB_PORT` defaults to 3306)                               |
| `DB_USER`, `DB_PASSWORD`         | Login for the app                                                          |
| `DB_DATABASE`                    | Database name. `db:init` creates it if it doesn't exist                    |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`  | `db:init` gives this email a Super login, for the admin panel              |
| `DEMO_EMAIL`, `DEMO_PASSWORD`    | Optional. `db:init` gives this email a Student login                       |
| `ANONYMOUS_CLIENTS`              | `true` lets anyone watch class streams without logging in (see below)      |

`npm run db:init` runs the files in `server/db` in order: `schema.sql` (tables and roles), `auth.sql`, `classes.sql`, then `admin.sql` (views and procedures). It's safe to re-run, and does the same for an existing database to bring it up to date: it never deletes rows, and never changes the password or roles of a user who already exists. After changing a file in `server/db`, run it again.

## Login and sessions

The procedures are in `server/db/auth.sql`. A user can only log in once they have a row in `accounts`.

| Route               | Does                                                    |
| ------------------- | ------------------------------------------------------- |
| `POST /api/login`   | Takes `{ email, password }`, sets the session cookies   |
| `POST /api/logout`  | Deletes the session and clears the cookies              |
| `GET /api/session`  | Returns the logged in user, or 401                      |

Login sets two `HttpOnly` cookies: `sessionID` (256 characters, stored as is) and `sessionKey` (stored as a SHA-256 hash). Protect a route by adding the `RequireSession` middleware from `server/src/auth.ts`, which puts the session on `res.locals.session`. Its `id` and `keyHash` are the values to pass to procedures that take a session.

## Admin panel

The panel is at `/admin`, for users with the Administrator or Super role. Its API is in `server/src/admin.ts` and its procedures are in `server/db/admin.sql`.

Each `admin.*` procedure takes the caller's session and checks their permissions itself. A failure is raised with `SIGNAL`: the last three digits of a `45xxx` SQLSTATE are the HTTP status, and the message is shown to the admin.

## Class addresses

A section's class page is `/c/{department}/{shorthand}`. The department is the letters at the start of the CRN (`CS63005` is `CS`). The shorthand is chosen per section, and must be unique within its department, ignoring case. See `server/db/classes.sql`.

`ANONYMOUS_CLIENTS` in `.env` sets who can open a class page. Restart the server after changing it.

| Visitor                       | `false` (default)  | `true`  |
| ----------------------------- | ------------------ | ------- |
| Not logged in                 | No access          | Viewer  |
| Logged in, Student or no role | Viewer             | Viewer  |
| Teacher of another class      | Host               | Viewer  |
| Teacher of this section       | Host               | Host    |
| Administrator or Super        | Host               | Host    |

## Socket.IO events

Define events in `shared/src/index.ts`. Both `server/src/index.ts` and `client/src/socket.ts` are typed against those interfaces, so a mismatched event name or payload is a compile error.

Set `PORT` to change the server port (default 4000).
