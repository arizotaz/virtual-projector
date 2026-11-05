import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { GetInfo, Login, Logout, SESSION_TTL_MS } from "./utils";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();

// npm sets this to the script name, so it's only "dev" under `npm run dev`
if (process.env.npm_lifecycle_event === "dev") {
    app.use(cors({ origin: true, credentials: true }));
}

app.use(express.urlencoded({ extended: true })); // handle url-encoding
app.use(express.json()); // handle JSON
app.use(cookieParser()); // handle cookies

// utilize the msal SSO logic in auth.ts
// import { auth, requireAuth } from "./auth.js";
// app.use("/auth", auth);
// app.get("/profile", requireAuth, (_req, res) => {
//     res.json(res.locals.user);
// });

import adminRoutes from "./routers/admin_routes";
app.use("/admin", adminRoutes);

import teacherRoutes from "./routers/teacher_routes";
app.use("/teacher", teacherRoutes);

import studentRoutes from "./routers/student_routes";
app.use("/student", studentRoutes);

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.get("/me", async (req, res) => {
    const userData = await GetInfo(req.cookies.sid ?? "");
    return res.json({
        user: userData
    })
});

app.get("/logout", async (req, res) => {
    try {
        await Logout(req.cookies.sid ?? "");
        res.clearCookie("sid");
        res.send("You've been logged out!")
    } catch (e) {
        console.error(`[LOGOUT ${new Date().toDateString()}]`, e);
        return res.status(500).send("Server Error");
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const { token, ret } = await Login(email, password, req.ip);
        if (ret.success) {
            res.cookie("sid", token, {
                httpOnly: true,   // not readable from JS
                secure: false,    // HTTPS only
                sameSite: "lax",
                maxAge: SESSION_TTL_MS,
            });
        }
        res.json(ret);
    } catch (e) {
        console.error(`[LOGIN ${new Date().toDateString()}]`, e);
        return res.status(500).send("Server Error");
    }
});

/**
 * @description - Section related to socket.io/webrtc logic
 */
import type { ClientToServerEvents, ServerToClientEvents } from "@virtual-projector/shared";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Server } from "socket.io";
import path from "node:path";

// import { SocketConnection } from "./socket";
import { RoomManager } from "./rooms";

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
const rooms = new RoomManager(io);

// In production, serve the built React app.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => {
        res.sendFile(path.join(clientDist, "index.html"));
    });
}

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
