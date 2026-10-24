import { useEffect } from "react";
import { GetBackendStr, UserData } from "../utilities/browser_utils";

const ROLE_BADGE: Record<string, string> = {
    Administrator: "text-bg-danger",
    Teacher: "text-bg-warning",
    Student: "text-bg-info",
};
const ROLE_HOME: Record<string, string> = {
    student: "/student",
    teacher: "/teacher",
    administrator: "/admin",
    super: "/admin",
};

export default function Navbar({ user }: { user: UserData | undefined | null }) {
    // if user can be resolved => valid sid cookie and session can find them in DB

    async function handleLogout() {
        const endpoint = GetBackendStr("/logout");
        await fetch(endpoint, {
            credentials: "include",
        });
        window.location.reload();
    }

    useEffect(() => {
        if (user === null) return; // still loading, don't redirect yet
        if (user === undefined) return; // still loading, don't redirect yet

        const path = window.location.pathname;

        // redirect authenticated users to their respective panel, otherwise redirect to login
        const target = user ? ROLE_HOME[user.role?.toLowerCase() ?? ""] : "/login";
        if (!target) return;

        // infinite redirection-loop prevention
        if (path === target || path.startsWith(target + "/")) return;

        window.location.replace(target);
    }, [user]);

    return (
        <nav className="navbar navbar-expand sticky-top bg-dark shadow-sm py-2" data-bs-theme="dark">
            <div className="container-fluid px-4">
                <a href="/" className="navbar-brand d-flex align-items-center gap-2 fw-semibold">
                    <span
                        className="rounded-2 bg-primary d-inline-flex align-items-center justify-content-center fs-6 fw-bold"
                        style={{ width: 32, height: 32 }}
                    >
                        VP
                    </span>
                    Virtual Projector
                </a>

                <ul className="navbar-nav ms-3 me-auto">
                    <li className="nav-item">
                        <a href="/" className="nav-link">Home</a>
                    </li>
                </ul>

                {/* loading placeholder, avoids a Login-button flash for logged-in users */}
                {user === null && (
                    <div className="placeholder-glow d-flex align-items-center gap-2">
                        <span className="placeholder rounded-circle" style={{ width: 40, height: 40 }} />
                        <span className="placeholder col-12 rounded" style={{ width: 110, height: 32 }} />
                    </div>
                )}

                {user === undefined && (
                    <a href="/login" className="btn btn-primary btn-sm px-3">Login</a>
                )}

                {user && (
                    <div className="d-flex align-items-center gap-3">
                        <div className="text-end lh-sm d-none d-md-block">
                            <div className="fw-semibold">{user.firstName}</div>
                            <div className="small text-secondary">{user.email}</div>
                        </div>

                        <div className="position-relative">
                            <div
                                className="rounded-circle bg-primary text-white fw-semibold d-flex align-items-center justify-content-center"
                                style={{ width: 40, height: 40 }}
                                title={user.email}
                            >
                                {user.firstName.charAt(0).toUpperCase()}
                            </div>
                        </div>

                        {user.role && (
                            <span className={`badge rounded-pill ${ROLE_BADGE[user.role] ?? "text-bg-secondary"}`}>
                                {user.role}
                            </span>
                        )}

                        <div className="position-relative">
                            <button
                                type="button"
                                className="btn btn-outline-light btn-sm"
                                onClick={handleLogout}
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}