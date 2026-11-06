import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { STUDENT_ROLE_ID, TEACHER_ROLE_ID, type AdminSection, type AdminUser, type Role } from "@virtual-projector/shared";
import { ActionResult, AdminRequest, FullName, useAction, useAdminData, useDebounced } from "./common";
import styles from "./admin.module.css";

interface UserListProps {
    title: string;
    /** Limits the list to one role, and is the role new users start with */
    roleId?: number;
    /** Where a user's page is: /admin/{kind}/{id} */
    kind: "user" | "student" | "teacher";
}

/** /admin/users, /admin/students and /admin/teachers */
let AdminUserList = ({ title, roleId, kind }: UserListProps) => {
    const [search, setSearch] = useState("");
    const query = useDebounced(search);
    const { data: users, error } = useAdminData<AdminUser[]>(
        `/users?search=${encodeURIComponent(query)}${roleId ? `&role=${roleId}` : ""}`,
    );

    return (
        <>
            <h1>{title}</h1>
            <label>
                Filter{" "}
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name or email"
                />
            </label>
            <ActionResult error={error} />
            {users && (
                <table>
                    <thead>
                        <tr><th>Name</th><th>Email</th><th>Roles</th><th>Login</th></tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td><Link to={`/admin/${kind}/${user.id}`}>{FullName(user)}</Link></td>
                                <td>{user.email}</td>
                                <td>{user.roles.map((role) => role.name).join(", ") || "None"}</td>
                                <td>{user.has_account ? "Yes" : "No"}</td>
                            </tr>
                        ))}
                        {users.length === 0 && <tr><td colSpan={4}>No users found</td></tr>}
                    </tbody>
                </table>
            )}
            <CreateUserForm roleId={roleId} kind={kind} />
        </>
    );
}

let CreateUserForm = ({ roleId, kind }: Pick<UserListProps, "roleId" | "kind">) => {
    const navigate = useNavigate();
    const { data: roles } = useAdminData<Role[]>("/roles");
    const { run, error } = useAction();

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        await run(async () => {
            const created = await AdminRequest<{ id: string }>("/users", "POST", {
                first_name: form.get("first_name"),
                middle_initial: form.get("middle_initial"),
                last_name: form.get("last_name"),
                email: form.get("email"),
                role_id: form.get("role_id") ? Number(form.get("role_id")) : undefined,
                password: form.get("password") || undefined,
            });
            navigate(`/admin/${kind}/${created.id}`);
        });
    };

    return (
        <>
            <h2>Add User</h2>
            <form className={styles.form} onSubmit={handleSubmit}>
                <label>First name <input name="first_name" required /></label>
                <label>Middle <input name="middle_initial" /></label>
                <label>Last name <input name="last_name" required /></label>
                <label>Email <input name="email" type="email" required /></label>
                <label>
                    Role
                    <select name="role_id" defaultValue={roleId ?? ""} key={roles?.length}>
                        <option value="">None</option>
                        {roles?.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                    </select>
                </label>
                <label>
                    Password (blank for no login)
                    <input name="password" type="password" autoComplete="new-password" minLength={8} />
                </label>
                <button type="submit">Add User</button>
            </form>
            <ActionResult error={error} />
        </>
    );
}

/** /admin/user/{id}, /admin/student/{id} and /admin/teacher/{id} */
let AdminUserDetail = () => {
    const { id } = useParams();
    const { data: user, error, reload } = useAdminData<AdminUser>(`/users/${id}`);

    if (error && !user) return <ActionResult error={error} />;
    if (!user) return null;

    return (
        <>
            <h1>{FullName(user)}</h1>
            <p>User ID: {user.id}</p>
            <ProfileForm key={user.id} user={user} onChange={reload} />
            <AccountSection user={user} onChange={reload} />
            <RolesSection user={user} onChange={reload} />
            <EnrollmentsSection user={user} />
            <TeachingSection user={user} />
            <DeleteUserSection user={user} />
        </>
    );
}

interface UserSectionProps {
    user: AdminUser;
    onChange: () => void;
}

let ProfileForm = ({ user, onChange }: UserSectionProps) => {
    const { run, error, notice } = useAction();

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const saved = await run(() => AdminRequest(`/users/${user.id}`, "PUT", {
            first_name: form.get("first_name"),
            middle_initial: form.get("middle_initial"),
            last_name: form.get("last_name"),
            email: form.get("email"),
        }), "Profile saved");
        if (saved) onChange();
    };

    return (
        <section>
            <h2>Profile</h2>
            <form className={styles.form} onSubmit={handleSubmit}>
                <label>First name <input name="first_name" defaultValue={user.first_name} required /></label>
                <label>Middle <input name="middle_initial" defaultValue={user.middle_initial ?? ""} /></label>
                <label>Last name <input name="last_name" defaultValue={user.last_name ?? ""} required /></label>
                <label>Email <input name="email" type="email" defaultValue={user.email} required /></label>
                <button type="submit">Save</button>
            </form>
            <ActionResult error={error} notice={notice} />
        </section>
    );
}

let AccountSection = ({ user, onChange }: UserSectionProps) => {
    const { run, error, notice } = useAction();

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formElement = e.currentTarget;
        const password = new FormData(formElement).get("password");
        const saved = await run(
            () => AdminRequest(`/users/${user.id}/account`, user.has_account ? "PUT" : "POST", { password }),
            user.has_account ? "Password changed. They've been logged out everywhere" : "Login created",
        );
        if (saved) {
            formElement.reset();
            onChange();
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Remove the login for ${FullName(user)}? They won't be able to log in.`)) return;
        if (await run(() => AdminRequest(`/users/${user.id}/account`, "DELETE"), "Login removed")) onChange();
    };

    return (
        <section>
            <h2>Login</h2>
            <p>{user.has_account ? `Logs in with ${user.email}` : "This user has no login, so they can't log in."}</p>
            <form className={styles.form} onSubmit={handleSubmit}>
                <label>
                    {user.has_account ? "New password" : "Password"}
                    <input name="password" type="password" autoComplete="new-password" minLength={8} required />
                </label>
                <button type="submit">{user.has_account ? "Change Password" : "Create Login"}</button>
                {user.has_account && <button type="button" onClick={handleDelete}>Remove Login</button>}
            </form>
            <ActionResult error={error} notice={notice} />
        </section>
    );
}

let RolesSection = ({ user, onChange }: UserSectionProps) => {
    const { data: roles } = useAdminData<Role[]>("/roles");
    const { run, error } = useAction();

    const toggle = async (role: Role, holds: boolean) => {
        await run(() => holds
            ? AdminRequest(`/users/${user.id}/roles`, "POST", { role_id: role.id })
            : AdminRequest(`/users/${user.id}/roles/${role.id}`, "DELETE"));
        onChange();
    };

    return (
        <section>
            <h2>Roles</h2>
            {roles?.map((role) => (
                <label key={role.id} style={{ marginRight: 16 }}>
                    <input
                        type="checkbox"
                        checked={user.roles.some((held) => held.id === role.id)}
                        onChange={(e) => toggle(role, e.target.checked)}
                    />
                    {" "}{role.name}
                </label>
            ))}
            <ActionResult error={error} />
        </section>
    );
}

let SectionLink = ({ section }: { section: AdminSection }) => (
    <Link to={`/admin/class/${encodeURIComponent(section.crn)}/section/${encodeURIComponent(section.sectionid)}`}>
        {section.class_name} ({section.crn}) section {section.sectionid}
    </Link>
);

let EnrollmentsSection = ({ user }: { user: AdminUser }) => {
    const { data: enrolled, error: loadError, reload } = useAdminData<AdminSection[]>(`/users/${user.id}/enrollments`);
    const { data: sections } = useAdminData<AdminSection[]>("/sections");
    const { run, error } = useAction();
    const [choice, setChoice] = useState("");

    const isStudent = user.roles.some((role) => role.id === STUDENT_ROLE_ID);
    const SectionPath = (section: AdminSection) =>
        `/classes/${encodeURIComponent(section.crn)}/sections/${encodeURIComponent(section.sectionid)}/students`;
    const available = sections?.filter((section) => !enrolled?.some((e) => e.crn === section.crn && e.sectionid === section.sectionid));

    const enroll = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const section = available?.[Number(choice)];
        if (!section) return;
        const added = await run(() => AdminRequest(SectionPath(section), "POST", { student_id: user.id }));
        if (added) {
            setChoice("");
            reload();
        }
    };

    const unenroll = async (section: AdminSection) => {
        if (await run(() => AdminRequest(`${SectionPath(section)}/${user.id}`, "DELETE"))) reload();
    };

    return (
        <section>
            <h2>Enrolled Classes</h2>
            <ActionResult error={loadError} />
            {enrolled && (
                <table>
                    <thead>
                        <tr><th>Class</th><th>Teacher</th><th>Address</th><th></th></tr>
                    </thead>
                    <tbody>
                        {enrolled.map((section) => (
                            <tr key={`${section.crn}/${section.sectionid}`}>
                                <td><SectionLink section={section} /></td>
                                <td><Link to={`/admin/teacher/${section.lecturer}`}>{section.lecturer_name}</Link></td>
                                <td>{section.department ? `/c/${section.department}/${section.classname}` : "None"}</td>
                                <td><button onClick={() => unenroll(section)}>Remove</button></td>
                            </tr>
                        ))}
                        {enrolled.length === 0 && <tr><td colSpan={4}>Not enrolled in any classes</td></tr>}
                    </tbody>
                </table>
            )}
            {isStudent ? (
                <form className={styles.form} onSubmit={enroll}>
                    <label>
                        Add to class
                        <select value={choice} onChange={(e) => setChoice(e.target.value)} required>
                            <option value="">Choose a section</option>
                            {available?.map((section, index) => (
                                <option key={`${section.crn}/${section.sectionid}`} value={index}>
                                    {section.class_name} ({section.crn}) section {section.sectionid}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button type="submit">Enroll</button>
                </form>
            ) : (
                <p>Give this user the Student role to enroll them in a class.</p>
            )}
            <ActionResult error={error} />
        </section>
    );
}

let TeachingSection = ({ user }: { user: AdminUser }) => {
    const { data: sections, error } = useAdminData<AdminSection[]>(`/users/${user.id}/teaching`);

    if (!user.roles.some((role) => role.id === TEACHER_ROLE_ID) && !sections?.length) return null;

    return (
        <section>
            <h2>Teaching</h2>
            <ActionResult error={error} />
            {sections && (
                <table>
                    <thead>
                        <tr><th>Class</th><th>Students</th></tr>
                    </thead>
                    <tbody>
                        {sections.map((section) => (
                            <tr key={`${section.crn}/${section.sectionid}`}>
                                <td><SectionLink section={section} /></td>
                                <td>{section.student_count}</td>
                            </tr>
                        ))}
                        {sections.length === 0 && <tr><td colSpan={2}>Not teaching any classes</td></tr>}
                    </tbody>
                </table>
            )}
        </section>
    );
}

let DeleteUserSection = ({ user }: { user: AdminUser }) => {
    const navigate = useNavigate();
    const { run, error } = useAction();

    const handleDelete = async () => {
        if (!window.confirm(`Permanently delete ${FullName(user)}, their login and their enrollments?`)) return;
        if (await run(() => AdminRequest(`/users/${user.id}`, "DELETE"))) navigate("/admin/users");
    };

    return (
        <section>
            <h2>Delete User</h2>
            <button onClick={handleDelete}>Delete User</button>
            <ActionResult error={error} />
        </section>
    );
}

export { AdminUserList, AdminUserDetail }
