import { useEffect, useRef, useState } from "react";

import type { RelayTree } from "@virtual-projector/shared";
import { RelayNode, type RelayStatus } from "../webrtc/RelayNode";
import { StreamDecoder } from "../webrtc/StreamDecoder";

import styles from "../webrtc.module.css"

const STATUS_TEXT: Record<RelayStatus, string> = {
    connecting: "Connecting…",
    waiting: "Waiting for the host to start streaming",
    receiving: "",
    live: "",
    error: "Error",
};

export default function StreamPanel({ room }: { room: string }) {
    const EMPTY_TREE: RelayTree = { room, sourceId: null, nodes: [] };

    let streamRef = useRef<MediaStream | null>(null);
    let previewRef = useRef<HTMLVideoElement>(null)
    let fakeClientRef = useRef<RelayNode | null>(null);
    let fakeClientDecoderRef = useRef<StreamDecoder | null>(null);

    let clientRefFakeCanvas = useRef<HTMLCanvasElement>(null);

    let [status, setStatus] = useState<RelayStatus | null>(null);
    let [error, setError] = useState<string | undefined>();
    let [tree, setTree] = useState<RelayTree>(EMPTY_TREE);

    let StopStream = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        fakeClientRef.current?.Stop();
        fakeClientRef.current = null;
        fakeClientDecoderRef.current?.Clear();
        fakeClientDecoderRef.current?.Close();
        fakeClientDecoderRef.current = null;
        if (previewRef.current) previewRef.current.srcObject = null;
        setStatus(null);
        setTree(EMPTY_TREE);
    }

    let StartStream = async () => {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            // Capped at 1080p/30: every relay uploads this to 3 children, and
            // screen content gains more from sharp frames than from frame rate.
            video: { frameRate: 60, width: { max: 3840 }, height: { max: 2160 } },
            audio: false,
        });
        streamRef.current = stream;
        previewRef.current!.srcObject = stream;
        await previewRef.current!.play();

        // User hit the browser's own "Stop sharing" button.
        stream.getVideoTracks()[0]?.addEventListener("ended", StopStream);

        // The fake client is the root of the relay tree. It runs the same
        // relay code as every viewer; its bytes just come from the one encoder
        // instead of a parent. The preview below decodes exactly what it sends.
        let fakeClient = new RelayNode(room, "source");
        let decoder = new StreamDecoder(clientRefFakeCanvas.current!);
        fakeClient.onStatus = (s, detail) => {
            setStatus(s);
            setError(detail);
        };
        fakeClient.onTree = setTree;
        fakeClient.onConfig = (c) => decoder.Configure(c);
        fakeClient.onFrame = (f) => decoder.Decode(f);
        decoder.onNeedKeyframe = () => fakeClient.RequestKeyframe();
        fakeClientDecoderRef.current = decoder;
        fakeClientRef.current = fakeClient;
        fakeClient.Start();
        fakeClient.SetLocalStream(stream);
    }

    useEffect(() => StopStream, []);

    return (
        <>
            <div className={`${styles.host}`}>
                {status ? (
                    <button onClick={StopStream}>Stop Stream</button>
                ) : (
                    <button onClick={StartStream}>Start Stream</button>
                )}
                <span> Room: {room} {status && `· ${status === "error" && error ? error : STATUS_TEXT[status]}`}</span>
                <video ref={previewRef} muted playsInline />
                <br /><br />
                
                <details>
                    <summary>Preview</summary>
                    <canvas ref={clientRefFakeCanvas} />
                </details>

                <details>
                    <summary>Peer-Tree Sumamry</summary>
                    {tree.sourceId && (
                        <>
                            <h3>Relay tree ({tree.nodes.length - 1} viewers)</h3>
                            {/* <RelayTreeView tree={tree} /> */}
                        </>
                    )}
                </details>

            </div>

        </>
    );
}