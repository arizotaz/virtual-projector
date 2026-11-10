import { useEffect, useState } from "react";
import type { AuthUser } from "@virtual-projector/shared";
import { socket } from "../socket";
import Navbar from "../components/navbar";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GetBackendStr } from "../utilities/browser_utils";
import { GetCurrentUser, GetEnrollments } from "../utilities/user";

export default function Home() {
    type EnrolledSection = { name: string; department: string; shorthand: string | null };

    const [loading, setLoading] = useState<boolean>(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [enrollments, setEnrollments] = useState<EnrolledSection[]>([]);

    useEffect(() => {
        const controller = new AbortController();

        let LoadUser = async() => {
            let usr = await GetCurrentUser(controller.signal);
            if (!controller.signal.aborted) {
                setUser(usr);
                setEnrollments(await GetEnrollments())
            }
            setLoading(false);
        }
        LoadUser();

        return () => controller.abort();
    }, []);

    if (loading) return (
        <span>Loading...</span>
    );

    if (!user) return (
        <main>
            <h1>Virtual Projector</h1>
            <p>
                Lorem ipsum dolor sit amet consectetur adipisicing elit.
                Dicta asperiores dolore, quaerat laboriosam rem nihil placeat
                aspernatur dignissimos distinctio explicabo dolores totam
                quibusdam hic consectetur iste rerum iure, eum accusantium.
            </p>
            Login <a href="/login">HERE</a>!
        </main>
    );

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
            <h1>Your Classes</h1>
            {enrollments.map( (c) => (
                <ul>
                    <li>
                        <a href={`/c/${c.department}/${c.shorthand}`}>{c.name}</a>
                    </li>
                </ul>
            ))}
        </main>
    );
}
