import { useEffect, useState } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import { ADMIN_ROLE_ID, type AdminStats, type AuthUser } from "@virtual-projector/shared";
import { GetCurrentUser, GetHighRoleOfUser } from "../../utilities/user";
import { ActionResult, useAdminData } from "./common";
import styles from "../../styles/admin.module.css";

/** Wraps every /admin page. The server enforces permissions; this just shows the right page. */
let AdminLayout = () => {
    const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

    useEffect(() => {
        const controller = new AbortController();
        GetCurrentUser(controller.signal).then((loaded) => {
            if (!controller.signal.aborted) setUser(loaded);
        });
        return () => controller.abort();
    }, []);

    if (user === undefined) return null;
    if (user === null) return <Navigate to="/login" replace />;
    if (GetHighRoleOfUser(user) < ADMIN_ROLE_ID) {
        return <main className={styles.admin}><p>You don't have access to the admin panel.</p></main>;
    }

    return (
        <main className={styles.admin}>
            <nav className={styles.nav}>
                <strong>Admin</strong>
                <Link to="/admin">Overview</Link>
                <Link to="/admin/users">All Users</Link>
                <Link to="/admin/students">Students</Link>
                <Link to="/admin/teachers">Teachers</Link>
                <Link to="/admin/classes">Classes</Link>
                <span>Signed in as {user.name}</span>
            </nav>
            <Outlet />
        </main>
    );
}

let AdminOverview = () => {
    const { data: stats, error } = useAdminData<AdminStats>("/stats");

    return (
        <>
            <h1>Overview</h1>
            <ActionResult error={error} />
            {stats && (
                <table>
                    <tbody>
                        <tr><th>Users</th><td><Link to="/admin/users">{stats.users}</Link></td></tr>
                        <tr><th>Users without a login</th><td>{stats.users_without_account}</td></tr>
                        <tr><th>Students</th><td><Link to="/admin/students">{stats.students}</Link></td></tr>
                        <tr><th>Teachers</th><td><Link to="/admin/teachers">{stats.teachers}</Link></td></tr>
                        <tr><th>Classes</th><td><Link to="/admin/classes">{stats.classes}</Link></td></tr>
                        <tr><th>Sections</th><td>{stats.sections}</td></tr>
                        <tr><th>Enrollments</th><td>{stats.enrollments}</td></tr>
                    </tbody>
                </table>
            )}
        </>
    );
}

export { AdminLayout, AdminOverview }
