export type UserData = {
    id: string,
    firstName: string,
    middleInitial: string | null,
    lastName: string | null,
    email: string,
    role: string,
};

/**
 * If back end host is defined in local .env it returns that,
 * otherwise returns /api with assumption of being ran in context
 * of NGINX with a reverse-proxy
 * 
 * @param dir 
 * @returns url string to provided directory endpoint
 */
export function GetBackendStr(dir: string) {
    //                  (npm run dev | npm start)          (docker compose)
    let BASE_DIR = import.meta.env.VITE_BACK_END_HOST ?? "/api/";
    if (!BASE_DIR.endsWith("/")) BASE_DIR += "/";

    const baseUrl = new URL(BASE_DIR, window.location.origin);
    return new URL(dir.replace(/^\/+/, ""), baseUrl).toString();
}

export type Access = "loading" | "unauthenticated" | "forbidden" | "ok";

export function CheckAccess(
    user: UserData | undefined | null,
    allowedRoles: ReadonlySet<string>
): Access {
    if (user === null) return "loading";
    if (!user) return "unauthenticated";

    const role = user.role?.toLowerCase() ?? "";
    return allowedRoles.has(role) ? "ok" : "forbidden";
}