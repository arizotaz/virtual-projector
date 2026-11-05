import { useEffect, useRef, useState } from "react";

import { RelayNode, type RelayStatus } from "../webrtc/RelayNode";
import { StreamDecoder } from "../webrtc/StreamDecoder";

import styles from "../webrtc.module.css";

const STATUS_TEXT: Record<RelayStatus, string> = {
    connecting: "Connecting…",
    waiting: "Waiting for the host to start streaming",
    receiving: "",
    live: "",
    error: "Error",
};

export default function StreamView({ room }: { room: string }) {
    let canvasRef = useRef<HTMLCanvasElement>(null);
    let [status, setStatus] = useState<RelayStatus>("connecting");
    let [error, setError] = useState<string | undefined>();

    useEffect(() => {
        // Every viewer is also a relay, it forwards what it receives to its own children.
        // Forwarding never decodes, the decoder here is only so this viewer can watch.
        let node = new RelayNode(room, "viewer");
        let decoder = new StreamDecoder(canvasRef.current!);
        node.onStatus = (s, detail) => {
            setStatus(s);
            setError(detail);
            if (s === "waiting") decoder.Clear();
        };
        node.onConfig = (c) => decoder.Configure(c);
        node.onFrame = (f) => decoder.Decode(f);
        decoder.onNeedKeyframe = () => node.RequestKeyframe();
        decoder.onError = (e) => {
            setStatus("error");
            setError(e);
        };
        node.Start();
        return () => {
            node.Stop();
            decoder.Close();
        };
    }, [room]);

    return (
        <>
            <div className={`${styles.client}`}>
                <div className={`${styles.container}`}>
                    <canvas ref={canvasRef} />
                </div>
                <div className={`${styles.overlay}`}>
                    {status === "error" ? `Error: ${error}` : STATUS_TEXT[status]}
                </div>
            </div>
        </>
    );
}