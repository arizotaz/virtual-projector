import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@virtual-projector/shared";
import { SocketConnection } from "./socket";
import { RoomManager } from "./rooms";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// In production, serve the built React app.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

/**
 * This code is unused right now but could be useful later
 * let SocketUserList: Record<string, SocketConnection> = {};
 */
const rooms = new RoomManager(io);

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);
  //SocketUserList[socket.id] = new SocketConnection(socket.id);

  socket.on("room:join", (payload, ack) => {
    if (typeof ack !== "function") return;
    const room = payload?.room;
    const role = payload?.role;
    if (typeof room !== "string" || room.length === 0 || room.length > 64) {
      return ack({ ok: false, error: "Invalid room name" });
    }
    if (role !== "source" && role !== "viewer") {
      return ack({ ok: false, error: "Invalid role" });
    }

    const error = rooms.Join(socket.id, room, role);
    ack(error ? { ok: false, error } : { ok: true, nodeId: socket.id });
  });

  socket.on("room:leave", () => rooms.Leave(socket.id));

  socket.on("relay:signal", (payload) => {
    if (typeof payload?.to !== "string" || typeof payload.signal?.type !== "string") return;
    rooms.GetRoom(socket.id)?.RelaySignal(socket.id, payload.to, payload.signal);
  });

  socket.on("relay:parent-failed", () => rooms.GetRoom(socket.id)?.ParentFailed(socket.id));

  const statuses = ["connecting", "waiting", "receiving", "live", "error"];
  socket.on("relay:status", (payload) => {
    if (!statuses.includes(payload?.status)) return;
    rooms.GetRoom(socket.id)?.SetStatus(socket.id, payload.status);
  });

  // Debug page. TODO: restrict to admins once auth exists; this exposes every socket id in the room.
  socket.on("room:watch", (payload) => {
    const room = payload?.room;
    if (typeof room !== "string" || room.length === 0 || room.length > 64) return;
    socket.join(rooms.WatchChannel(room));
    socket.emit("room:tree", rooms.GetTree(room));
  });

  socket.on("room:unwatch", (payload) => {
    if (typeof payload?.room === "string") socket.leave(rooms.WatchChannel(payload.room));
  });

  socket.on("disconnect", () => {
    rooms.Leave(socket.id);
    //delete SocketUserList[socket.id];
    console.log(`client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});
