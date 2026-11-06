import { useCallback, useEffect, useState } from "react";
import type { AdminUser } from "@virtual-projector/shared";
import { GetBackendStr } from "../../utilities/browser_utils";
import styles from "./admin.module.css";

/** Calls the admin API. Throws an Error with the server's message if the request fails. */
export async function AdminRequest<T = void>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(GetBackendStr(`/admin${path}`), {
        method,
        credentials: "include",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "Request failed");
    return result.data as T;
}

/** Loads from the admin API. Keeps showing the old data during a reload. */
export function useAdminData<T>(path: string) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        AdminRequest<T>(path, "GET", undefined, controller.signal)
            .then((loaded) => {
                setData(loaded);
                setError(null);
            })
            .catch((e: Error) => {
                if (!controller.signal.aborted) setError(e.message);
            });
        return () => controller.abort();
    }, [path, version]);

    const reload = useCallback(() => setVersion((v) => v + 1), []);
    return { data, error, reload };
}

/** Runs changes to the admin API, tracking the result to show with <ActionResult /> */
export function useAction() {
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const run = async (action: () => Promise<unknown>, successNotice?: string) => {
        setError(null);
        setNotice(null);
        try {
            await action();
            setNotice(successNotice ?? null);
            return true;
        } catch (e) {
            setError((e as Error).message);
            return false;
        }
    };

    return { run, error, notice };
}

export function ActionResult({ error, notice }: { error?: string | null; notice?: string | null }) {
    return (
        <>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            {notice && <p role="status" className={styles.notice}>{notice}</p>}
        </>
    );
}

/** A value that only updates once it stops changing, so a filter box doesn't search on every key */
export function useDebounced<T>(value: T, delayMs = 250) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
}

export function FullName(user: Pick<AdminUser, "first_name" | "middle_initial" | "last_name">) {
    return [user.first_name, user.middle_initial, user.last_name].filter(Boolean).join(" ");
}
