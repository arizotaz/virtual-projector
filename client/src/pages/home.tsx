import { useEffect, useState } from "react";
import type { AuthUser } from "@virtual-projector/shared";
import { socket } from "../socket";
import Navbar from "../components/navbar";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GetBackendStr } from "../utilities/browser_utils";

export default function Home() {
    const [user, setUser] = useState<AuthUser | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const loadUser = async () => {
            try {
                const response = await fetch(GetBackendStr("/session"), {
                    credentials: "include",
                    signal: controller.signal,
                });
                if (!response.ok) return;

                const data: { user: AuthUser } = await response.json();
                setUser(data.user);
            } catch (e) {
                if (!controller.signal.aborted) console.error("[-] Session Check Failed:", e);
            }
        };
        loadUser();

        return () => controller.abort();
    }, []);

    if (!user) return null;

    const details = [
        ["ID", user.id],
        ["Name", user.name],
        ["Initial", user.initial],
        ["Email", user.email],
        ["Roles", user.roles.map((role) => `${role.name} (${role.id})`).join(", ") || "None"],
    ];

    return (
        <main
            style={{
                minHeight: "100vh",
                boxSizing: "border-box",
                background: "#f5f5f5",
                color: "#111",
                fontFamily: "system-ui, sans-serif",
                padding: 24,
            }}
        >
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 16px", margin: 0 }}>
                {details.map(([label, value]) => (
                    <div key={label} style={{ display: "contents" }}>
                        <dt style={{ fontWeight: 600 }}>{label}</dt>
                        <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
                    </div>
                ))}
            </dl>
        </main>
    );
}
