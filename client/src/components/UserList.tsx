import { useCallback, useEffect, useRef, useState } from "react";
import { GetBackendStr, UserData } from "../utilities/browser_utils";
import Feedback from '../components/feedback';

type Role = "unknown" | "student" | "teacher" | "administrator" | "super";

// matches from backend PAGE_SIZE
const PAGE_SIZE = 10;

const ROLE_LABELS: Record<Role, string> = {
    unknown: "Unknown",
    student: "Student",
    teacher: "Teacher",
    administrator: "Administrator",
    super: "Super Administrator",
};

const ROLE_CLASSES: Record<Role, string> = {
    unknown: "text-bg-light",
    student: "text-bg-secondary",
    teacher: "text-bg-primary",
    administrator: "text-bg-warning",
    super: "text-bg-danger",
};

function normalizeRole(role?: string | null): Role {
    const key = (role ?? "").toLowerCase();
    return key in ROLE_LABELS ? (key as Role) : "unknown";
}

function RoleBadge({ role }: { role?: string | null }) {
    const r = normalizeRole(role);
    return <span className={`badge ${ROLE_CLASSES[r]}`}>{ROLE_LABELS[r]}</span>;
}

export default function UserList() {
    const [success, SetSuccess] = useState(false);
    const [msg, SetMsg] = useState<string|undefined|null>("");

    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<UserData[]>([]);

    const [search, setSearch] = useState("");
    const [role, setRole] = useState<Role | "">("");
    const [page, setPage] = useState(1);

    const requestId = useRef(0);

    const loadUsers = useCallback(async () => {
        const id = ++requestId.current;
        setLoading(true);
        try {
            const response = await fetch(
                GetBackendStr(`/admin/get_users?page=${page}`),
                { credentials: "include" }
            );
            const result = await response.json();

            console.log(result);

            if (id === requestId.current) setUsers(result.users ?? []);
        } catch (e) {
            console.error("[-] Error Fetching Users", e);
            if (id === requestId.current) setUsers([]);
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        loadUsers();
        return () => { requestId.current++; };
    }, [loadUsers]);

    const searchValue = search.trim().toLowerCase();
    const visibleUsers = users.filter((user) => {
        const matchesSearch =
            searchValue === "" ||
            [user.firstName, user.lastName, user.email]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(searchValue);

        const matchesRole = role === "" || normalizeRole(user.role) === role;

        return matchesSearch && matchesRole;
    });
    const hasNext = users.length === PAGE_SIZE;

    async function DeleteUser(uid: string, email: string) {
        try {
            if (!window.confirm(`Are you sure you want to DELETE ${email}?`))
                return;

            const endpoint = GetBackendStr("/admin/delete_user");
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    "uid": uid,
                }),
            });
    
            const result = await response.json();

            SetSuccess(result.success);
            SetMsg(result.message);
    
            // clear feedback after some time
            setTimeout(() => {
                SetMsg(null);
                loadUsers();
            }, result.success ? 1000 : 3000);
    
            if (result.success) {
                console.log("[+] DeleteUser Successful")
            } else {
                console.error("[-] DeleteUser Failed")
            }
        } catch (e) {
            console.error("[-] DeleteUser Failed:", e);
        }
    }

    return (
        <>
            <Feedback success={success} message={msg} />

            {/* Filter Controls */}
            <div className="row g-3 mb-3 align-items-end">
                <div className="col-12 col-md-7">
                    <label htmlFor="user-search" className="form-label">
                        Search
                    </label>

                    <input
                        id="user-search"
                        type="search"
                        className="form-control"
                        placeholder="Search by first name, last name, or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="col-12 col-md-4">
                    <label htmlFor="role-filter" className="form-label">
                        Role
                    </label>

                    <select
                        id="role-filter"
                        className="form-select"
                        value={role}
                        onChange={(e) => setRole(e.target.value as Role | "")}
                    >
                        <option value="">All roles</option>
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="administrator">Administrator</option>
                        <option value="super">Super Administrator</option>
                    </select>
                </div>

                <div className="col-12 col-md-1">
                    <button
                        type="button"
                        className="btn btn-outline-secondary w-100"
                        onClick={loadUsers}
                        disabled={loading}
                        title="Refresh users"
                    >
                        <i className={`bi bi-arrow-clockwise ${loading ? "spinner-border spinner-border-sm" : ""}`}>Refresh</i>
                    </button>
                </div>
            </div>

            {/* User Directory Table */}
            <div className={`table-responsive ${loading ? "opacity-50" : ""}`}>
                <table className="table table-hover align-middle mb-0">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th className="text-end">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {visibleUsers.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-center text-muted py-4">
                                    {loading ? "Loading..." : "No users found."}
                                </td>
                            </tr>
                        ) : (
                            visibleUsers.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        {user.firstName}{" "}
                                        {user.middleInitial ? `${user.middleInitial}. ` : ""}
                                        {user.lastName}
                                    </td>

                                    <td>{user.email}</td>

                                    <td>
                                        <RoleBadge role={user.role} />
                                    </td>

                                    <td className="text-end">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary me-2"
                                        >
                                            Edit
                                        </button>

                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={() => DeleteUser(user.id, user.email)}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table Page Controls */}
            <div className="d-flex justify-content-between align-items-center mt-3">
                <small className="text-muted">
                    Page {page} &middot; showing {visibleUsers.length} of {users.length} loaded
                </small>

                <nav>
                    <ul className="pagination mb-0">
                        <li className={`page-item ${page === 1 || loading ? "disabled" : ""}`}>
                            <button
                                type="button"
                                className="page-link"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1 || loading}
                            >
                                Previous
                            </button>
                        </li>

                        <li className="page-item active">
                            <span className="page-link">{page}</span>
                        </li>

                        <li className={`page-item ${!hasNext || loading ? "disabled" : ""}`}>
                            <button
                                type="button"
                                className="page-link"
                                onClick={() => setPage((p) => p + 1)}
                                disabled={!hasNext || loading}
                            >
                                Next
                            </button>
                        </li>
                    </ul>
                </nav>
            </div>
        </>
    );
}