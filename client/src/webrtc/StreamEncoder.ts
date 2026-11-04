import type { EncodedFrame, StreamConfig } from "./protocol";

// Tuned for screen content. Every relay uploads FANOUT x BITRATE, so keep
// this modest: 3 children x 4 Mbps = 12 Mbps of upload per relay at peak.
// Static screens use far less (variable bitrate).
export const ENCODER_BITRATE = 4_000_000;
export const ENCODER_FRAMERATE = 30;
// A keyframe at least this often, so anyone who missed a request still recovers.
const KEYFRAME_INTERVAL_MS = 5000;
// Don't let a burst of joins force keyframes faster than this.
const MIN_FORCED_KEYFRAME_GAP_MS = 1000;

// Preferred first. VP9 handles screen content (text, flat colors) much better than VP8.
const CODECS = ["vp09.00.10.08", "vp8"];

// Chrome-only API; not in the standard DOM typings.
declare const MediaStreamTrackProcessor:
    | (new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> })
    | undefined;

/**
 * Encodes a captured video track exactly once, on the host. The resulting
 * frames are what every node in the tree forwards untouched.
 */
export class StreamEncoder {
    public onConfig: (config: StreamConfig) => void = () => {};
    public onFrame: (frame: EncodedFrame) => void = () => {};
    public onError: (error: string) => void = () => {};

    private track: MediaStreamTrack;
    private encoder: VideoEncoder | null = null;
    private codec: string | null = null;
    private config: StreamConfig | null = null;
    private seq = 0;
    private stopped = false;
    private lastKeyframeAt = 0;
    private keyframeRequested = true;
    private stopReading: () => void = () => {};

    constructor(track: MediaStreamTrack) {
        this.track = track;
        // Tell the browser this is screen content: favor sharpness over motion
        track.contentHint = "detail";
    }

    public async Start() {
        this.codec = await PickCodec();
        if (!this.codec) return this.onError("This browser can't encode VP9 or VP8 video");
        if (this.stopped) return;

        this.encoder = new VideoEncoder({
            output: (chunk) => this.OnChunk(chunk),
            error: (err) => this.onError(`Encoder error: ${err.message}`),
        });
        this.ReadFrames();
    }

    public Stop() {
        this.stopped = true;
        this.stopReading();
        if (this.encoder && this.encoder.state !== "closed") this.encoder.close();
        this.encoder = null;
    }

    /** Rate-limited: a burst of joins only costs one keyframe */
    public RequestKeyframe() {
        this.keyframeRequested = true;
    }

    private Encode(frame: VideoFrame) {
        const encoder = this.encoder;
        // Skip frames if the encoder is behind instead of building up delay
        if (this.stopped || !encoder || encoder.state === "closed" || encoder.encodeQueueSize > 2) {
            frame.close();
            return;
        }

        // Configure on the first frame, and again whenever the shared window/screen changes size
        const width = frame.displayWidth & ~1;
        const height = frame.displayHeight & ~1;
        if (!this.config || this.config.codedWidth !== width || this.config.codedHeight !== height) {
            this.config = { codec: this.codec!, codedWidth: width, codedHeight: height };
            encoder.configure({
                codec: this.codec!,
                width,
                height,
                bitrate: ENCODER_BITRATE,
                framerate: ENCODER_FRAMERATE,
                bitrateMode: "variable",
                latencyMode: "realtime",
            });
            this.onConfig(this.config);
            this.keyframeRequested = true;
            this.lastKeyframeAt = 0;
        }

        const now = performance.now();
        const sinceKey = now - this.lastKeyframeAt;
        const keyFrame =
            sinceKey >= KEYFRAME_INTERVAL_MS || (this.keyframeRequested && sinceKey >= MIN_FORCED_KEYFRAME_GAP_MS);
        if (keyFrame) {
            this.keyframeRequested = false;
            this.lastKeyframeAt = now;
        }

        encoder.encode(frame, { keyFrame });
        frame.close();
    }

    private OnChunk(chunk: EncodedVideoChunk) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.onFrame({ seq: this.seq++ >>> 0, key: chunk.type === "key", timestamp: chunk.timestamp, data });
    }

    // Pull raw frames from the capture track
    private ReadFrames() {
        if (typeof MediaStreamTrackProcessor !== "undefined") {
            const reader = new MediaStreamTrackProcessor({ track: this.track }).readable.getReader();
            this.stopReading = () => reader.cancel().catch(() => {});
            let lastAt = 0;
            const pump = async () => {
                while (!this.stopped) {
                    const { value: frame, done } = await reader.read();
                    if (done || !frame) return;
                    // The capture can run faster than we encode; thin it to the target rate
                    const now = performance.now();
                    if (now - lastAt < 1000 / ENCODER_FRAMERATE - 2) {
                        frame.close();
                        continue;
                    }
                    lastAt = now;
                    this.Encode(frame);
                }
            };
            pump().catch((err) => this.onError(`Capture error: ${err}`));
            return;
        }

        // Fallback for Firefox, Safari: play the track in a hidden <video> and grab frames from it
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = new MediaStream([this.track]);
        video.play().catch(() => {});

        const timer = setInterval(() => {
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return;
            this.Encode(new VideoFrame(video, { timestamp: performance.now() * 1000 }));
        }, 1000 / ENCODER_FRAMERATE);

        this.stopReading = () => {
            clearInterval(timer);
            video.srcObject = null;
        };
    }
}

async function PickCodec(): Promise<string | null> {
    if (typeof VideoEncoder === "undefined") return null;
    for (const codec of CODECS) {
        const { supported } = await VideoEncoder.isConfigSupported({
            codec,
            width: 1920,
            height: 1080,
            bitrate: ENCODER_BITRATE,
            framerate: ENCODER_FRAMERATE,
            latencyMode: "realtime",
        });
        if (supported) return codec;
    }
    return null;
}