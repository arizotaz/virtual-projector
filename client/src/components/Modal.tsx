import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import styles from "./modal.module.css";

export default function Modal({ title, onClose, children }: { title: string, onClose: () => void, children: ReactNode }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        const overflow = document.body.style.overflow;

        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden"; // lock background scroll

        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    return createPortal(
        <div className={styles.backdrop} onClick={onClose}>
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
            >
                <header className={styles.header}>
                    <h1>{title}</h1>
                    <button onClick={onClose} aria-label="Close">×</button>
                </header>
                <div className={styles.body}>{children}</div>
            </div>
        </div>,
        document.body
    );
}