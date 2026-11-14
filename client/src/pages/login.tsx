import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GetBackendStr } from "../utilities/browser_utils";
import Feedback from '../components/feedback';

export default function Login() {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        try {
            e.preventDefault();
            setError(null);

            const form = new FormData(e.currentTarget);
            const email = form.get("email");
            const password = form.get("password");

            const endpoint = GetBackendStr("/login");
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    "email": email,
                    "password": password,
                }),
            });

            if (response.ok) {
                navigate("/");
                return;
            }

            setError(response.status === 401 ? "Incorrect email or password" : "Something went wrong. Please try again.");
        } catch (e) {
            console.error("[-] Login Failed:", e);
            setError("Could not reach the server. Please try again.");
        }
    };

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--background-color)",
                fontFamily: "system-ui, sans-serif",
                padding: 24,
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 400,
                    background: "var(--surface-color)",
                    padding: 32,
                    borderRadius: 12,
                    border: "1px solid var(--border-color)",
                }}
            >
                <h1 style={{ marginTop: 0, marginBottom: 8 }}>
                    Virtual Projector
                </h1>

                <Feedback success={success} message={msg} />

                <p style={{ color: "var(--muted-color)", marginBottom: 24 }}>
                    Sign in to your account
                </p>

                <a href="/api/auth/login" hidden>Login with Microsoft</a>

                <form onSubmit={(e) => handleSubmit(e)}>
                    <label
                        htmlFor="email"
                        style={{
                            display: "block",
                            marginBottom: 6,
                            fontWeight: 500,
                        }}
                    >
                        Email
                    </label>

                    <input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 12px",
                            marginBottom: 16,
                            border: "1px solid var(--border-color)",
                            borderRadius: 6,
                            fontSize: 16,
                        }}
                    />

                    <label
                        htmlFor="password"
                        style={{
                            display: "block",
                            marginBottom: 6,
                            fontWeight: 500,
                        }}
                    >
                        Password
                    </label>

                    <input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="Password"
                        autoComplete="current-password"
                        required
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 12px",
                            marginBottom: 24,
                            border: "1px solid var(--border-color)",
                            borderRadius: 6,
                            fontSize: 16,
                        }}
                    />

                    {error && (
                        <p role="alert" style={{ color: "var(--highlight-2)", marginTop: 0, marginBottom: 16 }}>
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        style={{
                            width: "100%",
                            padding: "11px 16px",
                            border: "none",
                            borderRadius: 6,
                            background: "var(--highlight-1)",
                            color: "var(--surface-color)",
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Log in
                    </button>
                </form>
            </div>
        </main>
    );
}
