import { Navigate, Outlet } from "react-router-dom";

import { CheckAccess, UserData } from "../utilities/browser_utils";

const ADMIN_ROLES = new Set(["administrator", "super"]);

/**
 * 
 * Reusable Administration Authorization check module
 * 
 * @param user User Data provided from the backend
 * @returns 
 */
function AdminGuard({ user }: { user: UserData | undefined | null }) {
    const access = CheckAccess(user, ADMIN_ROLES);

    if (access === "unauthenticated")
        return <Navigate to="/login" replace />;
    else if (access === "forbidden")
        return <Navigate to="/" replace />;

    return <Outlet />;
}

export default AdminGuard;