import { useEffect, useState } from "react";
import type { AuthUser } from "@virtual-projector/shared";
import { socket } from "../socket";
import Navbar from "../components/navbar";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GetBackendStr } from "../utilities/browser_utils";
import { GetCurrentUser } from "../utilities/user";

export default function Home() {
    const [user, setUser] = useState<AuthUser | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        let LoadUser = async() => {
            let usr = await GetCurrentUser(controller.signal);
            if (!controller.signal.aborted) setUser(usr);
        }
        LoadUser();

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
