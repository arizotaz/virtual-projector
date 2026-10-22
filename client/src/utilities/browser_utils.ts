/**
 * If back end host is defined in local .env it returns that,
 * otherwise returns /api with assumption of being ran in context
 * of NGINX with a reverse-proxy
 * 
 * @param dir 
 * @returns url string to provided directory endpoint
 */
export function GetBackendStr(dir: string) {
    let base = import.meta.env.VITE_BACK_END_HOST ?? "/api/";
    if (!base.endsWith("/")) base += "/";

    const baseUrl = new URL(base, window.location.origin);
    return new URL(dir.replace(/^\/+/, ""), baseUrl).toString();
}