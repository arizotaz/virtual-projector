import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@virtual-projector/shared";

// Same origin: Vite proxies /socket.io to the server in dev; the server serves the app in prod.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
