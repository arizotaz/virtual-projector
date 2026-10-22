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

## Socket.IO events

Define events in `shared/src/index.ts`. Both `server/src/index.ts` and `client/src/socket.ts` are typed against those interfaces, so a mismatched event name or payload is a compile error.

Set `PORT` to change the server port (default 4000).

## Docker Workflow
```console
docker compose up --build -d
```