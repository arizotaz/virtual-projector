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

```bash
npm install
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

Add a dependency to one package with `npm install <pkg> -w client` (or `-w server`).

## Login and sessions

The server reads `DB_*` from the root `.env` in development. The procedures are in `server/db/auth.sql`; apply it to a database with `mariadb -h <host> -u <user> -p <database> < server/db/auth.sql`.

A user can only log in once they have a row in `accounts`. `npm run seed:admin -w server` creates one for the existing `ADMIN_EMAIL` user with the `ADMIN_PASSWORD` value in `.env`.

| Route               | Does                                                    |
| ------------------- | ------------------------------------------------------- |
| `POST /api/login`   | Takes `{ email, password }`, sets the session cookies   |
| `POST /api/logout`  | Deletes the session and clears the cookies              |
| `GET /api/session`  | Returns the logged in user, or 401                      |

Login sets two `HttpOnly` cookies: `sessionID` (256 characters, stored as is) and `sessionKey` (stored as a SHA-256 hash). Protect a route by adding the `RequireSession` middleware from `server/src/auth.ts`, which puts the session on `res.locals.session`. Its `id` and `keyHash` are the values to pass to procedures that take a session.

## Admin panel

The panel is at `/admin`, for users with the Administrator or Super role. Its API is in `server/src/admin.ts` and its procedures are in `server/db/admin.sql`; apply `auth.sql`, then `classes.sql`, then `admin.sql`.

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
