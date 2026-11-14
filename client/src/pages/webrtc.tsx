import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RelayTree } from "@virtual-projector/shared";
import { socket } from "../socket";
import RelayTreeView, { TreeDepth } from "../components/relayTree";
import { DEFAULT_ROOM, RelayNode, type RelayStatus } from "../webrtc/RelayNode";
import { StreamDecoder } from "../webrtc/StreamDecoder";
import styles from "../styles/webrtc.module.css"
import ClassManagement from "../components/ClassManagement";

const EMPTY_TREE: RelayTree = { room: DEFAULT_ROOM, sourceId: null, nodes: [] };

const STATUS_TEXT: Record<RelayStatus, string> = {
    connecting: "Connecting…",
    waiting: "Waiting for the host to start streaming",
    receiving: "",
    live: "",
    error: "Error",
};

const HOST_STOPPED_TEXT = "The host stopped the stream. Waiting for it to start again";

/** Start/stop controls and preview for streaming the host's screen to a room */
let HostStream = ({ room, crn, sectionid }: { room: string, crn: string, sectionid: string }) => {
    let streamRef = useRef<MediaStream | null>(null);
    let previewRef = useRef<HTMLVideoElement>(null)
    let fakeClientRef = useRef<RelayNode | null>(null);

    let [status, setStatus] = useState<RelayStatus | null>(null);
    let [tree, setTree] = useState<RelayTree>(EMPTY_TREE);

    let StopStream = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        fakeClientRef.current?.Stop();
        fakeClientRef.current = null;
        if (previewRef.current) previewRef.current.srcObject = null;
        setStatus(null);
        setTree(EMPTY_TREE);
    }

    /** Opens the browser's screen/window picker. Returns null if the user cancels */
    let PickScreen = async () => {
        try {
            return await navigator.mediaDevices.getDisplayMedia({
                // Capped at 1080p/30: every relay uploads this to 3 children, and
                // screen content gains more from sharp frames than from frame rate.
                video: { frameRate: 60, width: { max: 3840 }, height: { max: 2160 } },
                audio: false,
            });
        } catch (e) {
            if ((e as Error).name !== "NotAllowedError") console.error("[-] Screen Capture Failed:", e);
            return null;
        }
    }

    let ShowPreview = (stream: MediaStream) => {
        streamRef.current = stream;
        previewRef.current!.srcObject = stream;
        previewRef.current!.play().catch(() => {});

        // User hit the browser's own "Stop sharing" button.
        stream.getVideoTracks()[0]?.addEventListener("ended", StopStream);
    }

    let StartStream = async () => {
        const stream = await PickScreen();
        if (!stream) return;
        ShowPreview(stream);

        // The fake client is the root of the relay tree. It runs the same
        // relay code as every viewer; its bytes just come from the one encoder
        // instead of a parent.
        let fakeClient = new RelayNode(room, "source");
        fakeClient.onStatus = (s) => setStatus(s);
        fakeClient.onTree = setTree;
        fakeClientRef.current = fakeClient;
        fakeClient.Start();
        fakeClient.SetLocalStream(stream);
    }

    /** Switches to another screen or window. Viewers stay connected throughout */
    let ChangeScreen = async () => {
        const stream = await PickScreen();
        if (!stream) return;

        // Sharing ended while the picker was open
        if (!fakeClientRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
        }

        const previous = streamRef.current;
        ShowPreview(stream);
        fakeClientRef.current.SetLocalStream(stream);
        previous?.getTracks().forEach((t) => t.stop());
    }

    useEffect(() => StopStream, []);

    return (
        <>
            <div className={`${styles.host}`}>
                {/* stream controls */}
                {status ? (
                    <>
                        <button onClick={ChangeScreen}>Change Screen</button>
                        {" "}
                        <button onClick={StopStream}>Stop Stream</button>
                    </>
                ) : (
                    <button onClick={StartStream}>Start Stream</button>
                )}

                {/* stream view-port */}
                <span> Room: {room} {status && `· ${STATUS_TEXT[status]}`}</span>
                <video ref={previewRef} muted playsInline />
                
                {/* internal modal for class management (keeps stream uninterrupted) */}
                <ClassManagement crn={crn} sectionid={sectionid} />

                {/* connection listing (needs to show student emails associated with tree-node) */}
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

let WebRTCHostPage = () => <HostStream room={DEFAULT_ROOM} crn={""} sectionid={""} />;

/** Watches a room's stream, and relays it on to this viewer's children */
let ViewerStream = ({ room }: { room: string }) => {
    let canvasRef = useRef<HTMLCanvasElement>(null);
    let pipVideoRef = useRef<HTMLVideoElement>(null);
    let hadStreamRef = useRef(false);
    let [status, setStatus] = useState<RelayStatus>("connecting");
    let [error, setError] = useState<string | undefined>();
    // Null until a picture is showing
    let [pictureSize, setPictureSize] = useState<{ width: number; height: number } | null>(null);
    let [pipReady, setPipReady] = useState(false);
    let [inPip, setInPip] = useState(false);

    useEffect(() => {
        // Every viewer is also a relay, it forwards what it receives to its own children.
        // Forwarding never decodes, the decoder here is only so this viewer can watch.
        let node = new RelayNode(room, "viewer");
        let decoder = new StreamDecoder(canvasRef.current!);
        node.onStatus = (s, detail) => {
            if (s === "receiving") hadStreamRef.current = true;
            setStatus(s);
            setError(detail);
            if (s === "waiting") {
                decoder.Clear();
                setPictureSize(null);
            }
        };
        node.onConfig = (c) => decoder.Configure(c);
        node.onFrame = (f) => decoder.Decode(f);
        decoder.onNeedKeyframe = () => node.RequestKeyframe();
        decoder.onPictureSize = (width, height) => setPictureSize({ width, height });
        decoder.onError = (e) => {
            setStatus("error");
            setError(e);
        };

        // Browsers only offer picture-in-picture for a <video>, so a hidden one plays the decoder's output
        let pipVideo = pipVideoRef.current!;
        pipVideo.srcObject = decoder.CreateOutputStream();
        pipVideo.play().catch(() => {});

        // React has no props for these two events
        let onEnterPip = () => setInPip(true);
        let onLeavePip = () => setInPip(false);
        pipVideo.addEventListener("enterpictureinpicture", onEnterPip);
        pipVideo.addEventListener("leavepictureinpicture", onLeavePip);

        node.Start();
        return () => {
            node.Stop();
            decoder.Close();
            pipVideo.srcObject = null;
            pipVideo.removeEventListener("enterpictureinpicture", onEnterPip);
            pipVideo.removeEventListener("leavepictureinpicture", onLeavePip);
        };
    }, [room]);

    let TogglePip = async () => {
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await pipVideoRef.current!.requestPictureInPicture();
        } catch (e) {
            console.error("[-] Picture-in-Picture Failed:", e);
        }
    };

    let message = "";
    if (status === "error") message = `Error: ${error}`;
    else if (status === "waiting") message = hadStreamRef.current ? HOST_STOPPED_TEXT : STATUS_TEXT.waiting;
    else if (status === "connecting" || !pictureSize) message = STATUS_TEXT.connecting;

    // The box takes the stream's shape, so no background shows around the picture. 16:9 until there is one.
    let playerStyle = { "--aspect": pictureSize ? pictureSize.width / pictureSize.height : 16 / 9 } as CSSProperties;

    return (
        <>
            <div className={`${styles.client}`}>
                <div className={`${styles.container}`}>
                    <div className={`${styles.player}`} style={playerStyle}>
                        <canvas ref={canvasRef} />
                        {message && <div className={`${styles.status}`}>{message}</div>}
                        <video
                            ref={pipVideoRef}
                            className={`${styles.pipVideo}`}
                            muted
                            playsInline
                            onLoadedMetadata={() => setPipReady(true)}
                        />
                        {document.pictureInPictureEnabled && !inPip && (
                            <button className={`${styles.pipButton}`} onClick={TogglePip} disabled={!pipReady}>
                                Picture-in-Picture
                            </button>
                        )}
                        {inPip && (
                            <div className={`${styles.pipOverlay}`}>
                                <p>This stream is playing in Picture-in-Picture</p>
                                <button onClick={TogglePip}>Return to Page</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

let WebRTCClientPage = () => <ViewerStream room={DEFAULT_ROOM} />;

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

export { HostStream, ViewerStream, WebRTCClientPage, WebRTCHostPage, WebRTCDebugPage }
