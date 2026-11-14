import { useEffect, useState, type ReactNode } from "react";
import { ADMIN_ROLE_ID, type AuthUser } from "@virtual-projector/shared";
import { socket } from "../socket";
import Navbar from "../components/navbar";
import { GetBackendStr } from "../utilities/browser_utils";
import { GetCurrentUser, GetEnrollments } from "../utilities/user";
import styles from "../styles/dashboard.module.css"

export default function Home() {
    type EnrolledSection = { name: string; department: string; shorthand: string | null };

    const [loading, setLoading] = useState<boolean>(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [enrollments, setEnrollments] = useState<EnrolledSection[]>([]);
    const [cardView, setCardView] = useState<"cardGrid" | "cardList">("cardGrid");

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

    const details = [
        ["ID", user.id],
        ["Name", user.name],
        ["Initial", user.initial],
        ["Email", user.email],
        ["Roles", user.roles.map((role) => `${role.name} (${role.id})`).join(", ") || "None"],
    ];

    const content: ReactNode[] = [];

    if (user.roles.some((r) => r.id >= ADMIN_ROLE_ID)) {
        content.push(<a key="admin" href="/admin">Admin Panel</a>);
    }

    content.push(
        <div className={styles.homeContent}>
            <Navbar user={{}} />
            <div className={styles.dashboardLayout}>
                <aside className={styles.dashboardUserInfo}>
                    <h1>Your Info</h1>
                    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 16px", margin: 0 }}>
                        {details.map(([label, value]) => (
                            <div key={label}>
                                <dt style={{ fontWeight: 600 }}>{label}</dt>
                                <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </aside>

                <section className={styles.dashboardClassList}>
                    <h2>Your Classes</h2>
                    <div className={styles.toggleViewButtons}>
                        <button type="button" className={styles.dashboardGridButton} onClick={() => setCardView("cardGrid")} aria-pressed={cardView === "cardGrid"}>Grid View</button>
                        <button type="button" className={styles.dashboardListButton} onClick={() => setCardView("cardList")} aria-pressed={cardView === "cardList"}>List View</button>
                    </div>
                    <ul className={`${styles.dashboardCards} ${styles[cardView]}`}>
                        {enrollments.map((c) => (
                            <li key={`${c.department}/${c.shorthand}`} className={styles.itemCard}>
                                <a href={`/c/${c.department}/${c.shorthand}`}>{c.name}</a>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>,
    );

    return (
        <main className={styles.homePage}>
            {content}
        </main>
    );
}
