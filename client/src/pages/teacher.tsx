import { useState, useEffect, useCallback } from "react";
import ClassView, { Class } from "../components/ClassView";

import "../teacher.css";
import { CheckAccess, GetBackendStr, UserData } from "../utilities/browser_utils";
import Feedback from '../components/feedback';

const TEACHER_ROLES = new Set(["teacher"]);

export default function Teacher({ user }: { user: UserData | undefined | null }) {
    const access = CheckAccess(user, TEACHER_ROLES);

    const [success, SetSuccess] = useState(false);
    const [msg, SetMsg] = useState<string | undefined | null>("");
    const [classes, setClasses] = useState<Class[]>([]);
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);

    const GetMyClasses = useCallback(async () => {
        try {
            const response = await fetch(GetBackendStr("/teacher/get_classes"), { credentials: "include" });
            const data = response.ok ? await response.json() : null;
            setClasses(data?.classes ?? []);
        } catch {
            setClasses([]);
        }
    }, []);

    useEffect(() => {
        if (access === "unauthenticated") window.location.replace("/login");
        else if (access === "forbidden") window.location.replace("/");
    }, [access]);

    useEffect(() => {
        if (access === "ok") GetMyClasses();
    }, [access, GetMyClasses]);

    if (access !== "ok") return null;

    if (selectedClass) {
        return (
            <ClassView
                class={selectedClass}
                onBack={() => setSelectedClass(null)}
            />
        );
    }

    async function createClass(event: React.SubmitEvent<HTMLFormElement>) {
        try {
            event.preventDefault();

            const form = new FormData(event.currentTarget);
            const data = {
                name: form.get("className"),
                crn: form.get("crn"),
                section: form.get("section"),
            };

            const endpoint = GetBackendStr("/teacher/add_class");
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

            if (result.success) {
                console.log("[+] Added Class Successful");
                GetMyClasses();
            } else {
                console.error("[-] Failed to Add Class!");
            }

            // clear feedback after some time
            setTimeout(() => SetMsg(null), result.success ? 1000 : 3000);
        } catch (e) {
            console.error("[-] Failed to Add Class:", e);
        }
    }

    async function deleteClass(classItem: Class) {
        if (!window.confirm(`Are you sure you want to DELETE ALL sections for "${classItem.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(
                GetBackendStr("/teacher/remove_class"),
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        crn: classItem.crn,
                    }),
                }
            );

            const result = await response.json();

            SetSuccess(result.success);
            SetMsg(result.message);

            if (result.success) GetMyClasses();

            setTimeout(() => SetMsg(null), result.success ? 1000 : 3000);
        } catch (e) {
            console.error("[-] Failed to Delete Class:", e);
            SetSuccess(false);
            SetMsg("Failed to Delete Class.");
        }
    }

    async function deleteSection(classItem: Class) {
        if (!window.confirm(`Are you sure you want to DELETE "${classItem.name} : Section ${classItem.section}"?`)) {
            return;
        }

        try {
            const response = await fetch(
                GetBackendStr("/teacher/remove_section"),
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        crn: classItem.crn,
                        section: classItem.section,
                    }),
                }
            );

            const result = await response.json();

            SetSuccess(result.success);
            SetMsg(result.message);

            if (result.success) GetMyClasses();

            setTimeout(() => SetMsg(null), result.success ? 1000 : 3000);
        } catch (e) {
            console.error("[-] Failed to Delete Section:", e);
            SetSuccess(false);
            SetMsg("Failed to Delete Section.");
        }
    }

    return (
        <main className="container-fluid py-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h1 className="mb-1">Teacher</h1>
                    <p className="text-muted mb-0">
                        Select a class to manage your stream.
                    </p>
                </div>
            </div>

            <div className="row g-4">
                <Feedback success={success} message={msg} />

                {/* Create class */}
                <div className="col-12 col-lg-4">
                    <div className="card shadow-sm">
                        <div className="card-header">
                            <h5 className="mb-0">Create Class</h5>
                        </div>

                        <div className="card-body">
                            <form onSubmit={createClass}>
                                <div className="mb-3">
                                    <label htmlFor="class-name" className="form-label">
                                        Class Name
                                    </label>
                                    <input
                                        id="class-name"
                                        name="className"
                                        type="text"
                                        className="form-control"
                                        required
                                    />
                                </div>

                                <div className="mb-3">
                                    <label htmlFor="class-crn" className="form-label">
                                        CRN
                                    </label>
                                    <input
                                        id="class-crn"
                                        name="crn"
                                        type="text"
                                        className="form-control"
                                        required
                                    />
                                </div>

                                <div className="mb-3">
                                    <label htmlFor="class-section" className="form-label">
                                        Section
                                    </label>
                                    <input
                                        id="class-section"
                                        name="section"
                                        type="text"
                                        className="form-control"
                                        required
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary w-100">
                                    Create Class
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Classes */}
                <div className="col-12 col-lg-8">
                    <h4 className="mb-3">My Classes</h4>

                    {classes.length === 0 ? (
                        <div className="alert alert-secondary">
                            You have not created any classes yet.
                        </div>
                    ) : (
                        <div className="row g-3">
                            {classes.map((classItem) => (
                                <div
                                    key={`${classItem.crn}-${classItem.section}`}
                                    className="col-12 col-md-6"
                                >
                                    {/* CLASS CARD */}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="card class-card shadow-sm w-100 text-start border"
                                        onClick={() => setSelectedClass(classItem)}
                                        onKeyDown={(e) => {
                                            if (e.target === e.currentTarget && e.key === "Enter")
                                                setSelectedClass(classItem);
                                        }}
                                    >
                                        <div className="card-body position-relative">
                                            <h5 className="card-title mb-2">
                                                {classItem.name}
                                            </h5>

                                            <div className="text-muted">
                                                <div>
                                                    <strong>CRN:</strong> {classItem.crn}
                                                </div>
                                                <div>
                                                    <strong>Section:</strong> {classItem.section}
                                                </div>
                                            </div>

                                            <span className="class-card-arrow">→</span>
                                        </div>

                                        <div className="card-footer bg-transparent d-flex justify-content-between align-items-center">
                                            <span className="text-primary">Manage class</span>

                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteSection(classItem);
                                                }}
                                            >
                                                Delete Section
                                            </button>

                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteClass(classItem);
                                                }}
                                            >
                                                Delete Class
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}