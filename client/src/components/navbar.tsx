export default function Navbar() {
    return (
        <nav
            style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "16px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #e5e5e5",
                background: "#ffffff",
                fontFamily: "system-ui, sans-serif",
            }}
        >
            <div
                style={{
                    fontSize: 20,
                    fontWeight: 700,
                }}
            >
                Virtual Projector
            </div>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                }}
            >
                <a
                    href="/"
                    style={{
                        color: "#222",
                        textDecoration: "none",
                    }}
                >
                    Home
                </a>

                <a
                    href="/login"
                    style={{
                        color: "#222",
                        textDecoration: "none",
                    }}
                >
                    Login
                </a>
            </div>
        </nav>
    );
}