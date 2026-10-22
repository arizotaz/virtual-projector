import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@virtual-projector/shared";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();

app.use(express.urlencoded({ extended: true })); // handle url-encoding
app.use(express.json()); // handle JSON
app.use(cookieParser(process.env.COOKIE_SECRET)); // handle special cookies

// utilize the msal SSO logic in auth.ts
// import { auth, requireAuth } from "./auth.js";
// app.use("/auth", auth);
// app.get("/profile", requireAuth, (_req, res) => {
//     res.json(res.locals.user);
// });

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        return res.json(data);
    } catch (e) {
        console.error(`[LOGIN ${new Date().toDateString()}]`, e);
        return res.status(500).send("Server Error");
    }
});

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

    socket.on("ping", () => {
        socket.emit("pong", { serverTime: Date.now() });
    });

    socket.on("disconnect", () => {
        console.log(`client disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`server listening on http://localhost:${PORT}`);
});
