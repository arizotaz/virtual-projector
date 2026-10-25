import { useState, useEffect } from "react";
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

    useEffect(() => {
        if (access === "unauthenticated") window.location.replace("/login");
        else if (access === "forbidden") window.location.replace("/");
    }, [access]);

    useEffect(() => {
        if (access !== "ok") return;
        let cancelled = false;

        async function GetMyClasses() {
            try {
                const response = await fetch(GetBackendStr("/teacher/get_classes"), { credentials: "include" });
                const data = response.ok ? await response.json() : null;
                
                // console.log(data?.classes ?? []);

                if (!cancelled) setClasses(data?.classes ?? []);
            } catch {
                if (!cancelled) setClasses([]);
            }
        }

        GetMyClasses();
        return () => { cancelled = true; };
    }, [access]);
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
    
            // clear feedback after some time
            setTimeout(() => {
                SetMsg(null);
                
                /*
                if (result.success)
                    window.location.href = "/";
                */
            }, result.success ? 1000 : 3000);
    
            if (result.success) {
                console.log(`[+] Added Class Successful`)
            } else {
                console.error(`[-] Failed to Add Class!`)
            }
        } catch (e) {
            console.error(`[-] Failed to Add Class:`, e);
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
                                    <label
                                        htmlFor="class-name"
                                        className="form-label"
                                    >
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
                                    <label
                                        htmlFor="class-crn"
                                        className="form-label"
                                    >
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
                                    <label
                                        htmlFor="class-section"
                                        className="form-label"
                                    >
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

                                <button
                                    type="submit"
                                    className="btn btn-primary w-100"
                                >
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
                                /* CLASS CARD / BUTTON */
                                <div
                                    key={classItem.classId}
                                    className="col-12 col-md-6"
                                >
                                    <button
                                        type="button"
                                        className="card class-card shadow-sm w-100 text-start border"
                                        onClick={() => setSelectedClass(classItem)}
                                    >
                                        <div className="card-body position-relative">
                                            <h5 className="card-title mb-2">
                                                {classItem.name}
                                            </h5>

                                            <div className="text-muted">
                                                <div>
                                                    <strong>CRN:</strong>{" "}
                                                    {classItem.crn}
                                                </div>

                                                <div>
                                                    <strong>Section:</strong>{" "}
                                                    {classItem.section}
                                                </div>
                                            </div>

                                            <span className="class-card-arrow">
                                                →
                                            </span>
                                        </div>

                                        <div className="card-footer bg-transparent">
                                            <span className="text-primary">
                                                Manage class
                                            </span>
                                        </div>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}