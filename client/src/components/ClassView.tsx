import { useEffect, useState } from "react";
import { ClassRoomName } from "@virtual-projector/shared";
import StreamPanel from "./StreamPanel";
import { GetBackendStr } from "../utilities/browser_utils";
import Feedback from '../components/feedback';

export type Class = {
    crn: string;
    name: string;
    section: string;
}

interface Student {
    id: string;
    firstName: string;
    middleInitial?: string;
    lastName: string;
    email: string;
}

interface ClassViewProps {
    class: Class;
    onBack: () => void;
}

export default function ClassView({
    class: classItem,
    onBack,
}: ClassViewProps) {
    const [success, SetSuccess] = useState(false);
    const [msg, SetMsg] = useState<string|undefined|null>("");

    const [students, setStudents] = useState<Student[]>([]);

    async function GetClassStudents() {
        try {
            const endpoint = GetBackendStr("/teacher/get_students");
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    "crn": classItem.crn,
                    "section": classItem.section,
                }),
            });
            const data = response.ok ? await response.json() : null;
            
            console.log(classItem);
            console.log(data?.students ?? []);

            setStudents(data?.students ?? []);
        } catch (e) {
            console.error(e);
            setStudents([]);
        }
    }

    useEffect(() => {
        GetClassStudents();
    }, [classItem]);

    async function handleRequest(uri: string, data: any) {
        const endpoint = GetBackendStr(uri);
        const response = await fetch(endpoint, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        SetSuccess(result.success);
        SetMsg(result.message);

        // clear feedback after some time
        setTimeout(() => {
            SetMsg(null);
            if (result.success)
                GetClassStudents();
        }, result.success ? 1000 : 3000);

        return result;
    }

    async function addStudent(event: React.SubmitEvent<HTMLFormElement>) {
        try {
            event.preventDefault();

            const form = new FormData(event.currentTarget);
            const data = {
                email: form.get("email"),
                crn: form.get("crn"),
                section: form.get("section"),
            };

            const result = await handleRequest("/teacher/add_student", data);
    
            if (result.success) {
                console.log(`[+] Student Added!`)
            } else {
                console.error(`[-] Add Student Failed!`)
            }
        } catch (e) {
            console.error(`[-] Add Student Failed:`, e);
        }
    }

    async function removeStudent(email: string, crn: string, section: string) {
        try {
            if (!window.confirm(`Are you sure you want to REMOVE ${email}`))
                return;

            const data = {
                email: email,
                crn: crn,
                section: section,
            };
    
            const result = await handleRequest("/teacher/remove_student", data);
    
            if (result.success) {
                console.log(`[+] Student Removed!`)
            } else {
                console.error(`[-] Remove Student Failed!`)
            }
        } catch (e) {
            console.error(`[-] Remove Student Failed:`, e);
        }
    }

    function importStudents(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        // TODO: Parse CSV and send student emails to API.
        console.log("Import students from:", file.name);

        event.target.value = "";
    }

    return (
        <main className="container-fluid py-4">
            <Feedback success={success} message={msg} />

            {/* Header */}
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
                <div>
                    <button
                        type="button"
                        className="btn btn-outline-secondary mb-3"
                        onClick={onBack}
                    >
                        ← Back to Classes
                    </button>

                    <h1 className="mb-1">{classItem.name}</h1>

                    <div className="text-muted">
                        CRN: {classItem.crn} · Section:{" "}
                        {classItem.section}
                    </div>
                </div>
            </div>

            <div className="row g-4">
                <StreamPanel room={ClassRoomName(classItem.crn, classItem.section)} />

                {/* Student allow list */}
                <div className="col-12">
                    <div className="card shadow-sm">
                        <div className="card-header">
                            <h5 className="mb-0">
                                Student Allow List
                            </h5>
                        </div>

                        <div className="card-body">
                            <div className="row g-4">
                                {/* Add student */}
                                <div className="col-12 col-lg-5">
                                    <h6>Add Student</h6>

                                    <form onSubmit={addStudent}>
                                        <div className="input-group mb-3">
                                            <input
                                                name="email"
                                                type="email"
                                                className="form-control"
                                                placeholder="student@example.com"
                                                required
                                            />
                                            <input
                                                name="crn"
                                                value={classItem.crn}
                                                hidden
                                            />
                                            <input
                                                name="section"
                                                value={classItem.section}
                                                hidden
                                            />

                                            <button
                                                type="submit"
                                                className="btn btn-primary"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </form>

                                    <hr />

                                    <h6>Import Students</h6>

                                    <label
                                        htmlFor="student-csv"
                                        className="form-label"
                                    >
                                        CSV File
                                    </label>

                                    <input
                                        id="student-csv"
                                        type="file"
                                        className="form-control"
                                        accept=".csv,text/csv"
                                        onChange={importStudents}
                                    />

                                    <div className="form-text">
                                        CSV should contain student email
                                        addresses.
                                    </div>
                                </div>

                                {/* Student list */}
                                <div className="col-12 col-lg-7">
                                    <div className="accordion">
                                        <div className="accordion-item">
                                            <h2 className="accordion-header">
                                                <button
                                                    className="accordion-button"
                                                    type="button"
                                                    data-bs-toggle="collapse"
                                                    data-bs-target="#studentList"
                                                >
                                                    Students (
                                                    {students.length})
                                                </button>
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => GetClassStudents()}>
                                                    Refresh
                                                </button>
                                            </h2>

                                            <div
                                                id="studentList"
                                                className="accordion-collapse collapse show"
                                            >
                                                <div className="accordion-body p-0">
                                                    {students.length ===
                                                    0 ? (
                                                        <div className="text-muted text-center p-4">
                                                            No students have
                                                            been added.
                                                        </div>
                                                    ) : (
                                                        <div className="table-responsive">
                                                            <table className="table table-hover align-middle mb-0">
                                                                <thead>
                                                                    <tr>
                                                                        <th>
                                                                            Name
                                                                        </th>
                                                                        <th>
                                                                            Email
                                                                        </th>
                                                                        <th className="text-end">
                                                                            Action
                                                                        </th>
                                                                    </tr>
                                                                </thead>

                                                                <tbody>
                                                                    {students.map(
                                                                        (
                                                                            student
                                                                        ) => (
                                                                            <tr
                                                                                key={
                                                                                    student.id
                                                                                }
                                                                            >
                                                                                <td>
                                                                                    {
                                                                                        student.firstName
                                                                                    }{" "}
                                                                                    {student.middleInitial
                                                                                        ? `${student.middleInitial}. `
                                                                                        : ""}
                                                                                    {
                                                                                        student.lastName
                                                                                    }
                                                                                </td>

                                                                                <td>
                                                                                    {
                                                                                        student.email
                                                                                    }
                                                                                </td>

                                                                                <td className="text-end">
                                                                                    <button
                                                                                        type="button"
                                                                                        className="btn btn-sm btn-outline-danger"
                                                                                        onClick={() =>
                                                                                            removeStudent(
                                                                                                student.email,
                                                                                                classItem.crn,
                                                                                                classItem.section
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        Remove
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}