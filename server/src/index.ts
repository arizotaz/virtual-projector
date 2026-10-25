import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@virtual-projector/shared";

import { GetInfo, Login, Logout, SESSION_TTL_MS } from "./utils";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();

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

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

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
