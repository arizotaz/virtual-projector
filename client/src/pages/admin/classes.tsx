import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { STUDENT_ROLE_ID, TEACHER_ROLE_ID, type AdminClass, type AdminSection, type AdminUser, type ShorthandStatus } from "@virtual-projector/shared";
import { ActionResult, AdminRequest, ClassAddress, FullName, useAction, useAdminData, useDebounced } from "./common";
import styles from "./admin.module.css";

let ClassPath = (crn: string) => `/classes/${encodeURIComponent(crn)}`;
let SectionPath = (crn: string, sectionid: string) => `${ClassPath(crn)}/sections/${encodeURIComponent(sectionid)}`;

/** /admin/classes */
let AdminClassList = () => {
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const query = useDebounced(search);
    const { data: classes, error: loadError } = useAdminData<AdminClass[]>(`/classes?search=${encodeURIComponent(query)}`);
    const { run, error } = useAction();

    const handleCreate = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const crn = String(form.get("crn")).trim();
        const created = await run(() => AdminRequest("/classes", "POST", { crn, name: form.get("name") }));
        if (created) navigate(`/admin/class/${encodeURIComponent(crn)}`);
    };

    return (
        <>
            <h1>Classes</h1>
            <label>
                Filter{" "}
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="CRN or name"
                />
            </label>
            <ActionResult error={loadError} />
            {classes && (
                <table>
                    <thead>
                        <tr><th>CRN</th><th>Name</th><th>Sections</th><th>Students</th></tr>
                    </thead>
                    <tbody>
                        {classes.map((item) => (
                            <tr key={item.crn}>
                                <td><Link to={`/admin/class/${encodeURIComponent(item.crn)}`}>{item.crn}</Link></td>
                                <td>{item.name}</td>
                                <td>{item.section_count}</td>
                                <td>{item.student_count}</td>
                            </tr>
                        ))}
                        {classes.length === 0 && <tr><td colSpan={4}>No classes found</td></tr>}
                    </tbody>
                </table>
            )}
            <h2>Add Class</h2>
            <form className={styles.form} onSubmit={handleCreate}>
                <label>CRN <input name="crn" maxLength={32} required /></label>
                <label>Name <input name="name" maxLength={512} required /></label>
                <button type="submit">Add Class</button>
            </form>
            <ActionResult error={error} />
        </>
    );
}

/** A dropdown of teachers, plus the current one if they've since lost the role */
let TeacherSelect = ({ value, onChange, currentName }: { value: string; onChange: (id: string) => void; currentName?: string }) => {
    const { data: teachers } = useAdminData<AdminUser[]>(`/users?role=${TEACHER_ROLE_ID}`);
    const currentMissing = value && currentName && !teachers?.some((teacher) => teacher.id === value);

    return (
        <select value={value} onChange={(e) => onChange(e.target.value)} required>
            <option value="">{teachers?.length === 0 ? "No teachers yet" : "Choose a teacher"}</option>
            {currentMissing && <option value={value}>{currentName}</option>}
            {teachers?.map((teacher) => <option key={teacher.id} value={teacher.id}>{FullName(teacher)}</option>)}
        </select>
    );
}

/** /admin/class/{crn} */
let AdminClassDetail = () => {
    const crn = useParams().crn!;
    const navigate = useNavigate();
    const { data: item, error: loadError } = useAdminData<AdminClass>(ClassPath(crn));
    const { data: sections, reload: reloadSections } = useAdminData<AdminSection[]>(`${ClassPath(crn)}/sections`);
    const { run, error, notice } = useAction();
    const [teacher, setTeacher] = useState("");

    if (loadError && !item) return <ActionResult error={loadError} />;
    if (!item) return null;

    const handleRename = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const name = new FormData(e.currentTarget).get("name");
        await run(() => AdminRequest(ClassPath(crn), "PUT", { name }), "Class saved");
    };

    const handleAddSection = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formElement = e.currentTarget;
        const sectionid = new FormData(formElement).get("sectionid");
        const added = await run(() => AdminRequest(`${ClassPath(crn)}/sections`, "POST", { sectionid, lecturer: teacher }));
        if (added) {
            formElement.reset();
            setTeacher("");
            reloadSections();
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Permanently delete ${item.name}, its sections and all their enrollments?`)) return;
        if (await run(() => AdminRequest(ClassPath(crn), "DELETE"))) navigate("/admin/classes");
    };

    return (
        <>
            <p><Link to="/admin/classes">All classes</Link></p>
            <h1>{item.name}</h1>
            <p>CRN: {item.crn}</p>
            <form key={item.name} className={styles.form} onSubmit={handleRename}>
                <label>Name <input name="name" defaultValue={item.name} maxLength={512} required /></label>
                <button type="submit">Save</button>
            </form>

            <h2>Sections</h2>
            {sections && (
                <table>
                    <thead>
                        <tr><th>Section</th><th>Teacher</th><th>Address</th><th>Students</th></tr>
                    </thead>
                    <tbody>
                        {sections.map((section) => (
                            <tr key={section.sectionid}>
                                <td>
                                    <Link to={`/admin/class/${encodeURIComponent(crn)}/section/${encodeURIComponent(section.sectionid)}`}>
                                        {section.sectionid}
                                    </Link>
                                </td>
                                <td><Link to={`/admin/teacher/${section.lecturer}`}>{section.lecturer_name}</Link></td>
                                <td>{ClassAddress(section) ?? "None"}</td>
                                <td>{section.student_count}</td>
                            </tr>
                        ))}
                        {sections.length === 0 && <tr><td colSpan={4}>No sections yet</td></tr>}
                    </tbody>
                </table>
            )}

            <h2>Add Section</h2>
            <form className={styles.form} onSubmit={handleAddSection}>
                <label>Section ID <input name="sectionid" maxLength={5} required /></label>
                <label>Teacher <TeacherSelect value={teacher} onChange={setTeacher} /></label>
                <button type="submit">Add Section</button>
            </form>

            <h2>Delete Class</h2>
            <button onClick={handleDelete}>Delete Class</button>
            <ActionResult error={error} notice={notice} />
        </>
    );
}

/** /admin/class/{crn}/section/{sectionid} */
let AdminSectionDetail = () => {
    const { crn, sectionid } = useParams() as { crn: string; sectionid: string };
    const navigate = useNavigate();
    const path = SectionPath(crn, sectionid);
    const { data: section, error: loadError, reload } = useAdminData<AdminSection>(path);
    const { run, error, notice } = useAction();
    const [teacher, setTeacher] = useState("");

    useEffect(() => {
        if (section) setTeacher(section.lecturer);
    }, [section]);

    if (loadError && !section) return <ActionResult error={loadError} />;
    if (!section) return null;

    const handleTeacher = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (await run(() => AdminRequest(`${path}/teacher`, "PUT", { lecturer: teacher }), "Teacher saved")) reload();
    };

    const handleDelete = async () => {
        if (!window.confirm(`Permanently delete section ${sectionid} and its enrollments?`)) return;
        if (await run(() => AdminRequest(path, "DELETE"))) navigate(`/admin/class/${encodeURIComponent(crn)}`);
    };

    return (
        <>
            <p><Link to={`/admin/class/${encodeURIComponent(crn)}`}>{section.class_name}</Link></p>
            <h1>{section.class_name}, section {section.sectionid}</h1>

            <h2>Teacher</h2>
            <form className={styles.form} onSubmit={handleTeacher}>
                <TeacherSelect value={teacher} onChange={setTeacher} currentName={section.lecturer_name} />
                <button type="submit">Save Teacher</button>
            </form>

            <ActionResult error={error} notice={notice} />

            <ShorthandSection section={section} path={path} onChange={reload} />

            <RosterSection path={path} onChange={reload} />

            <h2>Delete Section</h2>
            <button onClick={handleDelete}>Delete Section</button>
        </>
    );
}

/** Picks the section's /c/{department}/{shorthand} address, checking availability as it's typed */
let ShorthandSection = ({ section, path, onChange }: { section: AdminSection; path: string; onChange: () => void }) => {
    const saved = section.shorthand ?? "";
    const [value, setValue] = useState(saved);
    const [status, setStatus] = useState<ShorthandStatus | null>(null);
    const [checkError, setCheckError] = useState<string | null>(null);
    const { run, error, notice } = useAction();

    useEffect(() => {
        setStatus(null);
        setCheckError(null);
        if (value === "") return;

        const controller = new AbortController();
        AdminRequest<ShorthandStatus>(
            `${path}/shorthand-status?name=${encodeURIComponent(value)}`, "GET", undefined, controller.signal,
        )
            .then(setStatus)
            .catch((e: Error) => {
                if (!controller.signal.aborted) setCheckError(e.message);
            });
        return () => controller.abort();
    }, [value, path, saved]);

    // Only trust an answer about what's in the box right now
    const current = status?.name === value ? status : null;
    const canSave = value === ""
        ? saved !== ""
        : value !== saved && (current?.status === "available" || current?.status === "current");

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!canSave) return;
        const notice = value === "" ? "Address removed" : "Address saved";
        if (await run(() => AdminRequest(`${path}/shorthand`, "PUT", { shorthand: value }), notice)) onChange();
    };

    const address = ClassAddress(section);
    const good = current?.status === "available" || current?.status === "current";

    return (
        <>
            <h2>Class Address</h2>
            <p>{address ? <>Currently <Link to={address}>{address}</Link></> : "No address yet."}</p>
            <form className={styles.form} onSubmit={handleSubmit}>
                <label>
                    Shorthand
                    <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={64} autoComplete="off" spellCheck={false} />
                </label>
                <button type="submit" disabled={!canSave}>Save Address</button>
            </form>
            <p>/c/{section.department}/{value}</p>
            <p role="status" className={good ? styles.notice : current ? styles.error : undefined}>
                {value === ""
                    ? saved && "Saving this blank removes the address."
                    : checkError
                        ? <span className={styles.error}>{checkError}</span>
                        : current?.message ?? "Checking…"}
            </p>
            <ActionResult error={error} notice={notice} />
        </>
    );
}

let RosterSection = ({ path, onChange }: { path: string; onChange: () => void }) => {
    const { data: roster, error: loadError, reload } = useAdminData<AdminUser[]>(`${path}/students`);
    const [search, setSearch] = useState("");
    const query = useDebounced(search);
    const { data: students } = useAdminData<AdminUser[]>(`/users?role=${STUDENT_ROLE_ID}&search=${encodeURIComponent(query)}`);
    const { run, error } = useAction();

    const available = students?.filter((student) => !roster?.some((enrolled) => enrolled.id === student.id));

    const change = async (action: () => Promise<unknown>) => {
        if (await run(action)) {
            reload();
            onChange();
        }
    };

    return (
        <>
            <h2>Students ({roster?.length ?? 0})</h2>
            <ActionResult error={loadError ?? error} />
            {roster && (
                <table>
                    <thead>
                        <tr><th>Name</th><th>Email</th><th></th></tr>
                    </thead>
                    <tbody>
                        {roster.map((student) => (
                            <tr key={student.id}>
                                <td><Link to={`/admin/student/${student.id}`}>{FullName(student)}</Link></td>
                                <td>{student.email}</td>
                                <td>
                                    <button onClick={() => change(() => AdminRequest(`${path}/students/${student.id}`, "DELETE"))}>
                                        Remove
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {roster.length === 0 && <tr><td colSpan={3}>No students enrolled</td></tr>}
                    </tbody>
                </table>
            )}

            <h2>Enroll Students</h2>
            <label>
                Filter{" "}
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name or email"
                />
            </label>
            {available && (
                <table>
                    <thead>
                        <tr><th>Name</th><th>Email</th><th></th></tr>
                    </thead>
                    <tbody>
                        {available.map((student) => (
                            <tr key={student.id}>
                                <td>{FullName(student)}</td>
                                <td>{student.email}</td>
                                <td>
                                    <button onClick={() => change(() => AdminRequest(`${path}/students`, "POST", { student_id: student.id }))}>
                                        Enroll
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {available.length === 0 && <tr><td colSpan={3}>No students to enroll</td></tr>}
                    </tbody>
                </table>
            )}
        </>
    );
}

export { AdminClassList, AdminClassDetail, AdminSectionDetail }
