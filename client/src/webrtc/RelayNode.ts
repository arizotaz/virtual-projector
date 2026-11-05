import { io, type Socket } from "socket.io-client";
import type {
    ClientToServerEvents,
    RelayRole,
    RelaySignal,
    RelayStatus,
    RelayTree,
    ServerToClientEvents,
} from "@virtual-projector/shared";
import {
    Fragment,
    ReadHeader,
    Reassembler,
    type ControlMessage,
    type EncodedFrame,
    type StreamConfig,
} from "./protocol";
import { StreamEncoder } from "./StreamEncoder";

type RelaySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type { RelayStatus };


// A TURN server is needed for peers behind symmetric NATs
// For now we are just using google's
const RTC_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// If a child's channel has more than this queued, it can't keep up: stop
// sending it frames and resume at the next keyframe. This caps how far
// behind a slow link can fall without slowing down its siblings
const MAX_BUFFERED_BYTES = 1024 * 1024;
// Keyframe requests going up the tree, at most once per this interval per node
const KEYFRAME_REQUEST_GAP_MS = 1000;

/**
 * One WebRTC link (parent -> child). The parent always makes the offer, so
 * there is never any glare. Signals are processed one at a time, and ICE
 * candidates that arrive before the remote description are held back.
 */
class PeerLink {
    public readonly remoteId: string;
    public readonly pc = new RTCPeerConnection(RTC_CONFIG);
    private send: (signal: RelaySignal) => void;
    private chain: Promise<void> = Promise.resolve();
    private pendingCandidates: RTCIceCandidateInit[] = [];

    constructor(remoteId: string, send: (signal: RelaySignal) => void) {
        this.remoteId = remoteId;
        this.send = send;
        this.pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = e.candidate;
            this.send({ type: "candidate", candidate: { candidate, sdpMid, sdpMLineIndex, usernameFragment } });
        };
    }

    public Offer() {
        this.Queue(async () => {
            await this.pc.setLocalDescription(await this.pc.createOffer());
            this.send({ type: "offer", sdp: this.pc.localDescription!.sdp });
        });
    }

    public Handle(signal: RelaySignal) {
        this.Queue(async () => {
            if (signal.type === "candidate") {
                if (this.pc.remoteDescription) await this.pc.addIceCandidate(signal.candidate);
                else this.pendingCandidates.push(signal.candidate);
                return;
            }

            await this.pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
            for (const c of this.pendingCandidates.splice(0)) await this.pc.addIceCandidate(c);

            if (signal.type === "offer") {
                await this.pc.setLocalDescription(await this.pc.createAnswer());
                this.send({ type: "answer", sdp: this.pc.localDescription!.sdp });
            }
        });
    }

    public Close() {
        this.pc.onicecandidate = null;
        this.pc.ondatachannel = null;
        this.pc.onconnectionstatechange = null;
        this.pc.close();
    }

    private Queue(task: () => Promise<void>) {
        this.chain = this.chain.then(task).catch((err) => {
            if (this.pc.signalingState !== "closed") console.error(`[relay] ${this.remoteId}:`, err);
        });
    }
}

interface ChildLink {
    link: PeerLink;
    channel: RTCDataChannel;
    /** Child missed frames (just joined, or fell behind): only resume on a keyframe. */
    needsKey: boolean;
    /** Whether the frame currently being forwarded is going to this child. */
    forwarding: boolean;
}

/**
 * A node in the relay tree. Every participant runs the same code: it gets
 * encoded video from one parent over a data channel and forwards the exact
 * same bytes to up to 3 children. Relays never decode or re-encode, so the
 * last viewer in the tree sees the same quality as the first.
 *
 * The host's "fake client" is just a node with role "source": its bytes come
 * from a StreamEncoder (the only encoder in the whole tree) instead of a parent.
 *
 * Decoding for display is separate: the page hooks onConfig/onFrame up to a
 * StreamDecoder. The stream is video only.
 *
 * When a node is moved to a new parent its children keep their connections;
 * the node just waits for the next keyframe from the new parent and carries
 * on forwarding, so a reorg only reconnects one level of the branch.
 */
export class RelayNode {
    public onStatus: (status: RelayStatus, detail?: string) => void = () => {};
    public onTree: (tree: RelayTree) => void = () => {};
    /** Decoder config for local display */
    public onConfig: (config: StreamConfig) => void = () => {};
    /** A complete encoded frame for local display. Only called from a keyframe onward */
    public onFrame: (frame: EncodedFrame) => void = () => {};

    private socket: RelaySocket;
    private room: string;
    private role: RelayRole;

    private parent: PeerLink | null = null;
    private parentChannel: RTCDataChannel | null = null;
    private children = new Map<string, ChildLink>();
    private encoder: StreamEncoder | null = null;

    private config: StreamConfig | null = null;
    private lastSeq: number | null = null;
    // We have a keyframe and every frame since; safe to forward and decode
    private synced = false;
    private acceptingFrame = false;
    private reassembler = new Reassembler();
    private lastKeyRequestAt = -Infinity;

    constructor(room: string, role: RelayRole) {
        this.room = room;
        this.role = role;

        // Each node gets its own socket so the host page can run its own
        // control connection alongside the fake client
        this.socket = io({ forceNew: true, autoConnect: false });
        this.socket.on("connect", this.Join);
        // active is false when the server refused the connection, so it won't retry
        this.socket.on("connect_error", (e) => {
            if (!this.socket.active) this.SetStatus("error", e.message);
        });
        this.socket.on("disconnect", this.OnDisconnect);
        this.socket.on("relay:set-parent", ({ parentId }) => this.SetParent(parentId));
        this.socket.on("relay:add-child", ({ childId }) => this.AddChild(childId));
        this.socket.on("relay:remove-child", ({ childId }) => this.RemoveChild(childId));
        this.socket.on("relay:signal", ({ from, signal }) => this.OnSignal(from, signal));
        this.socket.on("room:tree", (tree) => this.onTree(tree));
    }

    public Start() {
        this.SetStatus("connecting");
        this.socket.connect();
    }

    public Stop() {
        this.onStatus = this.onTree = () => {};
        this.onConfig = () => {};
        this.onFrame = () => {};
        this.SetLocalStream(null);
        this.socket.emit("room:leave");
        this.socket.disconnect();
        this.OnDisconnect();
        this.socket.removeAllListeners();
    }

    /** Source only: encode this stream's video and send it down the tree. Audio is ignored */
    public SetLocalStream(stream: MediaStream | null) {
        this.encoder?.Stop();
        this.encoder = null;

        const track = stream?.getVideoTracks()[0];
        if (this.role !== "source") return;
        if (!track) return this.SetStatus("waiting");

        const encoder = new StreamEncoder(track);
        encoder.onConfig = (config) => this.SetConfig(config);
        encoder.onFrame = (frame) => {
            for (const packet of Fragment(frame)) this.Ingest(packet);
        };
        encoder.onError = (error) => this.SetStatus("error", error);
        this.encoder = encoder;
        this.synced = false;
        encoder.Start();
        this.SetStatus("live");
    }

    /** Ask the source for a keyframe (rate-limited). Used by the local decoder when it loses its place */
    public RequestKeyframe() {
        if (this.encoder) return this.encoder.RequestKeyframe();

        const now = performance.now();
        if (now - this.lastKeyRequestAt < KEYFRAME_REQUEST_GAP_MS) return;
        if (this.parentChannel?.readyState !== "open") return;

        this.lastKeyRequestAt = now;
        this.SendControl(this.parentChannel, { type: "keyframe" });
    }

    private Join = () => {
        this.socket.emit("room:join", { room: this.room, role: this.role }, (res) => {
            if (!res.ok) return this.SetStatus("error", res.error);
            if (this.role === "source") this.SetStatus(this.encoder ? "live" : "waiting");
        });
    };

    // Socket dropped: everything is torn down; on reconnect we rejoin with a
    // new id and the server places us again
    private OnDisconnect = () => {
        this.CloseParent();
        for (const id of [...this.children.keys()]) this.RemoveChild(id);
        this.SetStatus("connecting");
    };

    private SetParent(parentId: string | null) {
        this.CloseParent();

        if (!parentId) return this.SetStatus("waiting");
        this.SetStatus("connecting");

        const link = new PeerLink(parentId, (signal) => this.Send(parentId, signal));
        link.pc.ondatachannel = (e) => {
            const channel = e.channel;
            channel.binaryType = "arraybuffer";
            channel.onmessage = (msg) => {
                if (typeof msg.data === "string") this.OnParentControl(msg.data);
                else this.Ingest(msg.data as ArrayBuffer);
            };
            this.parentChannel = channel;
        };
        link.pc.onconnectionstatechange = () => {
            const state = link.pc.connectionState;
            if (state === "connected") this.SetStatus("receiving");
            if (state === "failed") this.socket.emit("relay:parent-failed");
        };
        this.parent = link;
    }

    private AddChild(childId: string) {
        this.RemoveChild(childId);

        const link = new PeerLink(childId, (signal) => this.Send(childId, signal));
        // Reliable + ordered, so fragments arrive complete and in order
        const channel = link.pc.createDataChannel("video", { ordered: true });
        channel.binaryType = "arraybuffer";

        const child: ChildLink = { link, channel, needsKey: true, forwarding: false };
        channel.onopen = () => {
            if (this.config) this.SendControl(channel, { type: "config", config: this.config });
            child.needsKey = true;
            this.RequestKeyframe();
        };
        channel.onmessage = (msg) => {
            if (typeof msg.data !== "string") return;
            const control = ParseControl(msg.data);
            if (control?.type === "keyframe") this.RequestKeyframe();
        };

        this.children.set(childId, child);
        link.Offer();
    }

    private RemoveChild(childId: string) {
        const child = this.children.get(childId);
        if (!child) return;
        child.channel.onopen = child.channel.onmessage = null;
        child.link.Close();
        this.children.delete(childId);
    }

    private OnSignal(from: string, signal: RelaySignal) {
        if (this.parent?.remoteId === from) return this.parent.Handle(signal);
        this.children.get(from)?.link.Handle(signal);
    }

    private OnParentControl(data: string) {
        const control = ParseControl(data);
        if (control?.type === "config") this.SetConfig(control.config);
    }

    private SetConfig(config: StreamConfig) {
        this.config = config;
        this.onConfig(config);
        for (const child of this.children.values()) {
            if (child.channel.readyState === "open") this.SendControl(child.channel, { type: "config", config });
        }
    }

    /**
     * One fragment, from the parent or (on the source) the encoder. Forwards
     * it untouched to each child that can take it, then rebuilds whole frames
     * for local display.
     */
    private Ingest(packet: ArrayBuffer) {
        const header = ReadHeader(packet);
        if (!header) return;

        if (header.index === 0) {
            // Missing frames (new parent, or upstream dropped some): decoding
            // would break until the next keyframe, so wait for one
            const gap = this.lastSeq !== null && header.seq !== ((this.lastSeq + 1) >>> 0);
            this.lastSeq = header.seq;
            if (gap) this.synced = false;

            if (!this.synced && !header.key) {
                this.acceptingFrame = false;
                this.RequestKeyframe();
                return;
            }
            this.synced = true;
            this.acceptingFrame = true;
            for (const child of this.children.values()) child.forwarding = this.ShouldForward(child, header.key);
        } else if (!this.acceptingFrame || header.seq !== this.lastSeq) {
            return;
        }

        for (const child of this.children.values()) {
            if (!child.forwarding) continue;
            try {
                child.channel.send(packet);
            } catch {
                child.forwarding = false;
                child.needsKey = true;
            }
        }

        const frame = this.reassembler.Push(header, packet);
        if (frame) this.onFrame(frame);
    }

    // Decided once per frame, so a child only ever gets whole frames
    private ShouldForward(child: ChildLink, key: boolean): boolean {
        if (child.channel.readyState !== "open") return false;
        if (child.needsKey && !key) return false;
        if (child.channel.bufferedAmount > MAX_BUFFERED_BYTES) {
            child.needsKey = true;
            this.RequestKeyframe();
            return false;
        }
        child.needsKey = false;
        return true;
    }

    private SendControl(channel: RTCDataChannel, message: ControlMessage) {
        try {
            channel.send(JSON.stringify(message));
        } catch {
            // Channel closing; the link is about to be torn down anyway
        }
    }

    private SetStatus(status: RelayStatus, detail?: string) {
        this.onStatus(status, detail);
        // Reported for the debug page.
        if (this.socket.connected) this.socket.emit("relay:status", { status });
    }

    private CloseParent() {
        this.parent?.Close();
        this.parent = null;
        if (this.parentChannel) this.parentChannel.onmessage = null;
        this.parentChannel = null;
        if (this.role !== "source") {
            this.synced = false;
            this.reassembler.Reset();
        }
    }

    private Send(to: string, signal: RelaySignal) {
        this.socket.emit("relay:signal", { to, signal });
    }
}

function ParseControl(data: string): ControlMessage | null {
    try {
        const message = JSON.parse(data);
        if (message?.type === "keyframe") return { type: "keyframe" };
        const config = message?.config;
        if (
            message?.type === "config" &&
            typeof config?.codec === "string" &&
            Number.isInteger(config.codedWidth) &&
            Number.isInteger(config.codedHeight)
        ) {
            return { type: "config", config: { codec: config.codec, codedWidth: config.codedWidth, codedHeight: config.codedHeight } };
        }
    } catch {
        // Ignore malformed messages from peers
    }
    return null;
}