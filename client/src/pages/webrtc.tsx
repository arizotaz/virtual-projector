import { useEffect, useRef, useState } from "react";
import type { RelayTree } from "@virtual-projector/shared";
import { socket } from "../socket";
import RelayTreeView, { TreeDepth } from "../components/relayTree";
import { DEFAULT_ROOM, RelayNode, type RelayStatus } from "../webrtc/RelayNode";
import { StreamDecoder } from "../webrtc/StreamDecoder";
import styles from "./webrtc.module.css"

const EMPTY_TREE: RelayTree = { room: DEFAULT_ROOM, sourceId: null, nodes: [] };

const STATUS_TEXT: Record<RelayStatus, string> = {
    connecting: "Connecting…",
    waiting: "Waiting for the host to start streaming",
    receiving: "",
    live: "",
    error: "Error",
};

let WebRTCHostPage = () => {
    let streamRef = useRef<MediaStream | null>(null);
    let previewRef = useRef<HTMLVideoElement>(null)
    let fakeClientRef = useRef<RelayNode | null>(null);
    let fakeClientDecoderRef = useRef<StreamDecoder | null>(null);

    let clientRefFakeCanvas = useRef<HTMLCanvasElement>(null);

    let [status, setStatus] = useState<RelayStatus | null>(null);
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
        let fakeClient = new RelayNode(DEFAULT_ROOM, "source");
        let decoder = new StreamDecoder(clientRefFakeCanvas.current!);
        fakeClient.onStatus = (s) => setStatus(s);
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
                <span> Room: {DEFAULT_ROOM} {status && `· ${STATUS_TEXT[status]}`}</span>
                <video ref={previewRef} muted playsInline />
                <br /><br />
                <canvas ref={clientRefFakeCanvas} />
                {tree.sourceId && (
                    <>
                        <h3>Relay tree ({tree.nodes.length - 1} viewers)</h3>
                        <RelayTreeView tree={tree} />
                    </>
                )}
            </div>

        </>
    );
}

let WebRTCClientPage = () => {
    let canvasRef = useRef<HTMLCanvasElement>(null);
    let [status, setStatus] = useState<RelayStatus>("connecting");
    let [error, setError] = useState<string | undefined>();

    useEffect(() => {
        // Every viewer is also a relay, it forwards what it receives to its own children.
        // Forwarding never decodes, the decoder here is only so this viewer can watch.
        let node = new RelayNode(DEFAULT_ROOM, "viewer");
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
    }, []);

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

let WebRTCDebugPage = () => {
    let [room, setRoom] = useState(DEFAULT_ROOM);
    let [tree, setTree] = useState<RelayTree>(EMPTY_TREE);
    let [updatedAt, setUpdatedAt] = useState<number | null>(null);
    let [connected, setConnected] = useState(socket.connected);

    useEffect(() => {
        setTree({ room, sourceId: null, nodes: [] });

        let watch = () => socket.emit("room:watch", { room });
        let onTree = (t: RelayTree) => {
            if (t.room !== room) return;
            setTree(t);
            setUpdatedAt(Date.now());
        };
        let onConnect = () => {
            setConnected(true);
            watch();
        };
        let onDisconnect = () => setConnected(false);

        socket.on("room:tree", onTree);
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        if (socket.connected) watch();

        return () => {
            socket.emit("room:unwatch", { room });
            socket.off("room:tree", onTree);
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, [room]);

    let viewers = tree.nodes.filter((n) => n.role === "viewer");
    let count = (status: RelayStatus) => viewers.filter((n) => n.status === status).length;

    return (
        <div className={`${styles.debug}`}>
            <h2>Relay debug</h2>
            <label>
                Room <input value={room} onChange={(e) => setRoom(e.target.value)} />
            </label>
            <p>
                Socket: {connected ? "connected" : "disconnected"}
                {updatedAt && ` · updated ${new Date(updatedAt).toLocaleTimeString()}`}
            </p>
            <p>
                Source: {tree.sourceId ? "online" : "offline"} · Viewers: {viewers.length}
                {" "}(receiving {count("receiving")}, connecting {count("connecting")}, waiting {count("waiting")}, error {count("error")})
                {" "}· Depth: {TreeDepth(tree)}
            </p>
            <RelayTreeView tree={tree} />
        </div>
    );
}

export { WebRTCClientPage, WebRTCHostPage, WebRTCDebugPage }
