import type { EncodedFrame, StreamConfig } from "./protocol";

/**
 * Decodes the forwarded frames for local display and paints them on a
 * canvas. This is only for watching: forwarding never goes through here.
 */
export class StreamDecoder {
    /** The decoder lost its place and needs a keyframe to resume */
    public onNeedKeyframe: () => void = () => {};
    public onError: (error: string) => void = () => {};

    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private decoder: VideoDecoder | null = null;
    private config: StreamConfig | null = null;
    private waitingForKey = true;
    private closed = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    public Close() {
        this.closed = true;
        this.CloseDecoder();
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
        if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
            this.canvas.width = frame.displayWidth;
            this.canvas.height = frame.displayHeight;
        }
        this.ctx.drawImage(frame, 0, 0);
        frame.close();
    }
}