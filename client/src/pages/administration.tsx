import { useEffect } from "react";

import { CheckAccess, UserData } from "../utilities/browser_utils";

import UserList from "../components/UserList";
import UserCreateForm from "../components/UserCreateForm";

const ADMIN_ROLES = new Set(["administrator", "super"]);

export default function Admin({ user }: { user: UserData | undefined | null }) {
    // authorization check
    const access = CheckAccess(user, ADMIN_ROLES);
    useEffect(() => {
        if (access === "unauthenticated") window.location.replace("/login");
        else if (access === "forbidden") window.location.replace("/");
    }, [access]);
    if (access !== "ok") return null;
    
    const role = user?.role.toLowerCase() ?? "";
    return (
        <main className="container-fluid py-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h1 className="mb-1">Administration</h1>
                    <p className="text-muted mb-0">
                        Manage Virtual Projector users and administrators.
                    </p>
                </div>
            </div>

            <div className="row g-4">
                {/* User listing */}
                <div className="col-12">
                    <div className="card shadow-sm">
                        <div className="card-header">
                            <h5 className="mb-0">Users</h5>
                        </div>

                        <div className="card-body">
                            <UserList />
                        </div>
                    </div>
                </div>
            </div>

            <div className="row g-4 mt-4">
                {/* Create student */}
                <div className="col">
                    <div className="card shadow-sm h-100">
                        <div className="card-header">
                            <h5 className="mb-0">Create Student</h5>
                        </div>

                        <div className="card-body">
                            <UserCreateForm
                                userType="student"
                                uriTarget="/admin/new_student"
                            />
                        </div>
                    </div>
                </div>

                {/* Create teacher */}
                <div className="col">
                    <div className="card shadow-sm h-100">
                        <div className="card-header">
                            <h5 className="mb-0">Create Teacher</h5>
                        </div>

                        <div className="card-body">
                            <UserCreateForm
                                userType="teacher"
                                uriTarget="/admin/new_teacher"
                            />
                        </div>
                    </div>
                </div>

                {/* Create admins (only show for the super-admin) */}
                {role === "super" && (
                    <div className="col">
                        <div className="card shadow-sm h-100">
                            <div className="card-header">
                                <h5 className="mb-0">Create Administrator</h5>
                            </div>

                            <div className="card-body">
                                <UserCreateForm
                                    userType="admin"
                                    uriTarget="/admin/new_admin"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}