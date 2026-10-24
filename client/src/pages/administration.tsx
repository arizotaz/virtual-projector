import { Navigate } from "react-router-dom";
import { UserData } from "../utilities/browser_utils";

import UserList from "../components/UserList";
import UserCreateForm from "../components/UserCreateForm";

export default function Admin({ user }: { user: UserData | undefined | null }) {
    if (user === null) return null;                              // still loading
    if (!user) return <Navigate to="/login" replace />;          // unauthenticated

    const role = user.role?.toLowerCase();
    if (role !== "administrator" && role !== "super")
        return <Navigate to="/" replace />;                      // wrong role

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

                {/* Create teacher */}
                <div className="col-12 col-xl-6">
                    <div className="card shadow-sm h-100">
                        <div className="card-header">
                            <h5 className="mb-0">Create Teacher</h5>
                        </div>

                        <div className="card-body">
                            <UserCreateForm userType="teacher" uriTarget="/admin/new_teacher" />
                        </div>
                    </div>
                </div>

                {/* Create administrator IF ROLE = SUPER */}
                {role === "super" && (
                    <div className="col-12 col-xl-6">
                        <div className="card shadow-sm h-100">
                            <div className="card-header">
                                <h5 className="mb-0">Create Administrator</h5>
                            </div>


                            <div className="card-body">
                                <UserCreateForm userType="admin" uriTarget="/admin/new_admin" />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}