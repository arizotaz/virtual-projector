import { useEffect, useState } from "react";
import { GetBackendStr } from "../utilities/browser_utils";

import { ClassRoomName } from '@virtual-projector/shared';
import StreamView from '../components/StreamView';

interface Enrollment {
    crn: string;
    name: string;
    section: string;
}

export default function Student() {
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);

    useEffect(() => {
        async function getEnrollments() {
            try {
                const response = await fetch(
                    GetBackendStr("/student/get_enrollments"),
                    {
                        credentials: "include",
                    }
                );

                const data = response.ok ? await response.json() : null;

                setEnrollments(data?.enrollments ?? []);
            } catch (e) {
                console.error("[-] Failed to get enrollments:", e);
                setEnrollments([]);
            }
        }

        getEnrollments();
    }, []);

    if (selectedEnrollment) {
        return (
            <main className="container-fluid py-4">
                <button
                    type="button"
                    className="btn btn-outline-secondary mb-4"
                    onClick={() => setSelectedEnrollment(null)}
                >
                    ← Back to Classes
                </button>

                <h1 className="mb-1">
                    {selectedEnrollment.name}
                </h1>

                <p className="text-muted">
                    CRN: {selectedEnrollment.crn} · Section:{" "}
                    {selectedEnrollment.section}
                </p>

                {/* class content here */}
                <StreamView room={ClassRoomName(selectedEnrollment.crn, selectedEnrollment.section)} />
            </main>
        );
    }

    return (
        <main className="container-fluid py-4">
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h1 className="mb-1">My Classes</h1>
                    <p className="text-muted mb-0">
                        Select a class to view its stream.
                    </p>
                </div>
            </div>

            {/* Empty state */}
            {enrollments.length === 0 ? (
                <div className="card shadow-sm">
                    <div className="card-body text-center py-5">
                        <h5 className="mb-2">
                            No Classes
                        </h5>

                        <p className="text-muted mb-0">
                            You are not currently enrolled in any classes.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="row g-4">
                    {enrollments.map((enrollment) => (
                        <div
                            key={`${enrollment.crn}-${enrollment.section}`}
                            className="col-12 col-md-6 col-xl-4"
                        >
                            <button
                                type="button"
                                className="card class-card shadow-sm w-100 text-start border"
                                onClick={() =>
                                    setSelectedEnrollment(enrollment)
                                }
                            >
                                <div className="card-body position-relative">
                                    <h5 className="card-title mb-3">
                                        {enrollment.name}
                                    </h5>

                                    <div className="text-muted">
                                        <div>
                                            <strong>CRN:</strong>{" "}
                                            {enrollment.crn}
                                        </div>

                                        <div>
                                            <strong>Section:</strong>{" "}
                                            {enrollment.section}
                                        </div>
                                    </div>

                                    <span className="class-card-arrow">
                                        →
                                    </span>
                                </div>

                                <div className="card-footer bg-transparent">
                                    <span className="text-primary">
                                        View class
                                    </span>
                                </div>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}