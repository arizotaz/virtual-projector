import type { EncodedFrame, StreamConfig } from "./protocol";

// Chrome-only API; not in the standard DOM typings.
declare const MediaStreamTrackGenerator:
    | (new (init: { kind: "video" }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> })
    | undefined;

/**
 * Decodes the forwarded frames for local display and paints them on a
 * canvas. This is only for watching: forwarding never goes through here.
 */
export class StreamDecoder {
    /** The decoder lost its place and needs a keyframe to resume */
    public onNeedKeyframe: () => void = () => {};
    public onError: (error: string) => void = () => {};
    /** A picture's size, when it first shows after starting or a Clear, and whenever it changes */
    public onPictureSize: (width: number, height: number) => void = () => {};

    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private decoder: VideoDecoder | null = null;
    private config: StreamConfig | null = null;
    private waitingForKey = true;
    private closed = false;
    private painted = false;
    private outputWriter: WritableStreamDefaultWriter<VideoFrame> | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
    }

    /**
     * A video stream of whatever this decoder shows, for picture-in-picture.
     * Decoded frames are fed in directly where possible, because a canvas may
     * stop capturing while its tab is hidden, which is when PiP matters most.
     */
    public CreateOutputStream(): MediaStream {
        if (typeof MediaStreamTrackGenerator === "undefined") return this.canvas.captureStream();

        const generator = new MediaStreamTrackGenerator({ kind: "video" });
        this.outputWriter = generator.writable.getWriter();
        return new MediaStream([generator]);
    }

    public async Configure(config: StreamConfig) {
        if (typeof VideoDecoder === "undefined") return this.onError("This browser can't decode video (no WebCodecs)");

        const { supported } = await VideoDecoder.isConfigSupported(config);
        if (this.closed) return;
        if (!supported) return this.onError(`This browser can't decode ${config.codec}`);

        this.config = config;
        this.ResetDecoder();
    }

    public Decode(frame: EncodedFrame) {
        const decoder = this.decoder;
        if (!decoder || decoder.state !== "configured") return;

        if (this.waitingForKey && !frame.key) return;
        // Falling behind (slow device): drop until the next keyframe instead of adding delay
        if (decoder.decodeQueueSize > 3 && !frame.key) {
            this.waitingForKey = true;
            this.onNeedKeyframe();
            return;
        }
        this.waitingForKey = false;

        try {
            decoder.decode(new EncodedVideoChunk({
                type: frame.key ? "key" : "delta",
                timestamp: frame.timestamp,
                data: frame.data,
            }));
        } catch {
            this.ResetDecoder();
        }
    }

    public Clear() {
        this.waitingForKey = true;
        this.painted = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Blank the output too, so PiP doesn't stay frozen on the last picture
        if (this.outputWriter && !this.closed) {
            this.WriteOutput(new VideoFrame(this.canvas, { timestamp: performance.now() * 1000 }));
        }
    }

    public Close() {
        this.closed = true;
        this.CloseDecoder();
        this.outputWriter?.close().catch(() => {});
        this.outputWriter = null;
    }

    private CloseDecoder() {
        if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
        this.decoder = null;
    }

    private ResetDecoder() {
        this.CloseDecoder();
        if (!this.config || this.closed) return;

        const decoder: VideoDecoder = new VideoDecoder({
            output: (frame) => this.Paint(frame),
            error: () => {
                // Corrupt or missing reference frame; start over from the next keyframe
                queueMicrotask(() => {
                    if (this.decoder === decoder) this.ResetDecoder();
                });
            },
        });
        this.decoder = decoder;
        this.decoder.configure({ ...this.config, optimizeForLatency: true });
        this.waitingForKey = true;
        this.onNeedKeyframe();
    }

    private Paint(frame: VideoFrame) {
        const { displayWidth: width, displayHeight: height } = frame;
        const resized = this.canvas.width !== width || this.canvas.height !== height;
        if (resized) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.ctx.drawImage(frame, 0, 0);
        this.WriteOutput(frame);

        if (resized || !this.painted) {
            this.painted = true;
            this.onPictureSize(width, height);
        }
    }

    /** Sends a frame to the output stream if it can take one, and always closes it */
    private WriteOutput(frame: VideoFrame) {
        const writer = this.outputWriter;
        if (!writer || (writer.desiredSize ?? 1) <= 0) {
            frame.close();
            return;
        }
        writer.write(frame).catch(() => {}).finally(() => frame.close());
    }
}
