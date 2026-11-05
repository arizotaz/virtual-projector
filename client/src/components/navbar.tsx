import { useEffect } from "react";
import { GetBackendStr, UserData } from "../utilities/browser_utils";

import styles from "./navbar.module.css"

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

        // const path = window.location.pathname;

        // // redirect authenticated users to their respective panel, otherwise redirect to login
        // const target = user ? ROLE_HOME[user.role?.toLowerCase() ?? ""] : "/login";
        // if (!target) return;

        // // infinite redirection-loop prevention
        // if (path === target || path.startsWith(target + "/")) return;

        // window.location.replace(target);
    }, [user]);

    return (
        <nav className={`${styles.navbar}`}>
            <div className={`${styles.container}`}>
                <div>
                    Virtual Projector
                </div>
                <div className={`userContent`}>
                    {
                        user === null ? (
                            <NavUserLogin user={user} />
                        ) : (
                            <NavUserProfile user={user} />
                        )
                    }
                </div>
            </div>
        </nav>
    );
}

let NavUserLogin = ({ user }: { user: UserData | undefined | null }) => {
    return (
        <>
            <div className="loginDir">
                <button>Login</button>
            </div>
        </>
    );
}

let NavUserProfile = ({ user }: { user: UserData | undefined | null }) => {
    return (
        <>
            <div className={`${styles.userProfile}`}>
                <div className={`${styles.container}`}>
                    <div className={`${styles.picture}`}>
                        <div className={`${styles.profileImage}`}>
                            {user?.firstName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                    <div className={`${styles.info}`}>
                        <p className={`${styles.name}`}>{user?.firstName}</p>
                        <p className={`${styles.email}`}>{user?.email}</p>

                    </div>
                </div>
            </div>
        </>
    );
}