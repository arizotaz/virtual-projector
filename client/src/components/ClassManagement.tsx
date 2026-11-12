import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AdminUser, STUDENT_ROLE_ID } from "@virtual-projector/shared";

import { ActionResult, AdminRequest, FullName, useAction, useAdminData, useDebounced } from "../pages/admin/common";
import { SectionPath } from "../pages/admin/classes";

import Modal from "./Modal";
function ClassManagementPanel({ crn, sectionid } : { crn: string, sectionid: string }) {
    const path = SectionPath(crn, sectionid);
    const { data: roster, error: loadError, reload } = useAdminData<AdminUser[]>(`${path}/students`);

    const [search, setSearch] = useState("");
    const query = useDebounced(search);
    const { data: students } = useAdminData<AdminUser[]>(`/users?role=${STUDENT_ROLE_ID}&search=${encodeURIComponent(query)}`);

    const { run, error } = useAction();

    const available = students?.filter((student) => !roster?.some((enrolled) => enrolled.id === student.id));

    const change = async (action: () => Promise<unknown>) => {
        if (await run(action)) {
            reload();
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

export default function ClassManagement(props: { crn: string, sectionid: string }) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);

    return (
        <>
            <button onClick={() => { setOpen(true); console.log("BTN PRESSED!"); }}>Manage Students</button>
            {open && (
                <Modal title="Class Management" onClose={close}>
                    <ClassManagementPanel {...props} />
                </Modal>
            )}
        </>
    );
}
