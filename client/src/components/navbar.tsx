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
            <div className="container-fluid px-4 d-flex align-items-center">
                <a
                    href="/"
                    className="navbar-brand d-flex align-items-center gap-2 fw-bold fs-5 mb-0 me-auto"
                    style={{ letterSpacing: "0.02em" }}
                >
                    Virtual Projector
                </a>

                {/* loading placeholder, avoids a Login-button flash for logged-in users */}
                {user === null && (
                    <div className="placeholder-glow d-flex align-items-center gap-3 ms-auto">
                        <span className="placeholder rounded-circle" style={{ width: 38, height: 38 }} />
                        <span className="placeholder rounded-pill" style={{ width: 110, height: 28 }} />
                    </div>
                )}

                {user === undefined && (
                    <a href="/login" className="btn btn-light btn-sm rounded-pill px-4 fw-semibold ms-auto">
                        Login
                    </a>
                )}

                {user && (
                    <div className="d-flex align-items-center gap-3 ms-auto">
                        <div className="text-end lh-sm d-none d-md-block">
                            <div className="fw-semibold text-white">{user.firstName}</div>
                            <div
                                className="small text-white-50 text-truncate"
                                style={{ maxWidth: 220 }}
                            >
                                {user.email}
                            </div>
                        </div>

                        <div className="position-relative">
                            <div
                                className="rounded-circle text-white fw-semibold d-flex align-items-center justify-content-center flex-shrink-0 user-select-none"
                                style={{
                                    width: 38,
                                    height: 38,
                                    background: "linear-gradient(135deg, #0d6efd, #6f42c1)",
                                    boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.25)",
                                }}
                                title={user.email}
                            >
                                {user.firstName.charAt(0).toUpperCase()}
                            </div>
                        </div>

                        {user.role && (
                            <span
                                className={`badge rounded-pill text-capitalize px-3 py-2 ${ROLE_BADGE[user.role] ?? "text-bg-secondary"}`}
                                style={{ letterSpacing: "0.03em" }}
                            >
                                {user.role}
                            </span>
                        )}

                        <div className="position-relative ps-3 border-start border-secondary-subtle border-opacity-25">
                            <button
                                type="button"
                                className="btn btn-outline-light btn-sm rounded-pill px-3"
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