import { GetBackendStr } from "../utilities/browser_utils";

export default function Login() {
    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        try {
            e.preventDefault();

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
    
            const result = await response.json();
    
            if (result.success) {
                console.log("[+] Login Successful")
            } else {
                console.error("[-] Login Failed: Incorrect email or password!")
            }
        } catch (e) {
            console.error("[-] Login Failed:", e);
        }
    };

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f5f5f5",
                fontFamily: "system-ui, sans-serif",
                padding: 24,
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 400,
                    background: "white",
                    padding: 32,
                    borderRadius: 12,
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
                }}
            >
                <h1 style={{ marginTop: 0, marginBottom: 8 }}>
                    Virtual Projector
                </h1>

                <p style={{ color: "#666", marginBottom: 24 }}>
                    Sign in to your account
                </p>

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
                        required
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 12px",
                            marginBottom: 16,
                            border: "1px solid #ccc",
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
                        required
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 12px",
                            marginBottom: 24,
                            border: "1px solid #ccc",
                            borderRadius: 6,
                            fontSize: 16,
                        }}
                    />

                    <button
                        type="submit"
                        style={{
                            width: "100%",
                            padding: "11px 16px",
                            border: "none",
                            borderRadius: 6,
                            background: "#111",
                            color: "white",
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