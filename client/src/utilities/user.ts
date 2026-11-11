import { AuthUser } from "@virtual-projector/shared";
import { GetBackendStr } from "./browser_utils";

/**
 * Returns the current user data if the user has
 */
const GetCurrentUser = async (
    signal?: AbortSignal
): Promise<AuthUser | null> => {
    try {
        const response = await fetch(GetBackendStr("/session"), {
            credentials: "include",
            signal,
        });
        if (!response.ok) return null;

        const data: { user: AuthUser } = await response.json();
        return data.user;
    } catch (e) {
        if (!signal?.aborted) console.error("[-] Session Check Failed:", e);
        return null;
    }
};

type EnrolledSection = { name: string; department: string; shorthand: string | null };
const GetEnrollments = async (
    signal?: AbortSignal
): Promise<EnrolledSection[]> => {
    try {
        const response = await fetch(GetBackendStr("/my-classes"), {
            credentials: "include",
            signal,
        });
        if (!response.ok) return [];

        const data: { ok: boolean, classes: EnrolledSection[] } = await response.json();
        return data.ok ? data.classes : [];
    } catch (e) {
        if (!signal?.aborted) console.error("[-] Enrollment Fetching Failed:", e);
        return [];
    }
};


const GetRolesOfUser = (user: AuthUser | null): number[] => {
    return user?.roles.map((role) => role.id) ?? [];
};

const GetHighRoleOfUser = (user: AuthUser | null): number => {
    const roles = GetRolesOfUser(user);
    return roles.length > 0 ? Math.max(...roles) : 0;
};



export { 
    GetCurrentUser, 
    GetEnrollments, 
    GetRolesOfUser, 
    GetHighRoleOfUser
}