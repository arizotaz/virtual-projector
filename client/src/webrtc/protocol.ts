/**
 * Wire format for the relay's data channels.
 *
 * The host encodes the video once. Each encoded frame is cut into fragments
 * small enough for any browser's data channel, and relays forward those
 * fragments byte-for-byte. Nobody below the host decodes in order to forward.
 *
 * Binary message = 24-byte header + payload slice:
 *   u8  kind (always PACKET_FRAGMENT)
 *   u8  flags (bit 0 = keyframe)
 *   u16 fragment index
 *   u16 fragment count
 *   u16 reserved
 *   u32 frame sequence number (increments by 1 per encoded frame)
 *   u32 total frame byte length
 *   f64 timestamp (microseconds)
 *
 * String messages are JSON control messages (see ControlMessage).
 */

export const PACKET_FRAGMENT = 1;
export const HEADER_SIZE = 24;
// 16 KiB per message is the size every browser's data channel handles safely.
export const MAX_MESSAGE_SIZE = 16 * 1024;
const MAX_PAYLOAD = MAX_MESSAGE_SIZE - HEADER_SIZE;

const FLAG_KEY = 1;

export interface StreamConfig {
    codec: string;
    codedWidth: number;
    codedHeight: number;
}

export type ControlMessage =
    /** Down the tree: how to configure the decoder. Sent before any frame that needs it */
    | { type: "config"; config: StreamConfig }
    /** Up the tree: a node needs a keyframe to (re)start decoding/forwarding */
    | { type: "keyframe" };

export interface EncodedFrame {
    seq: number;
    key: boolean;
    timestamp: number;
    data: Uint8Array;
}

export interface FragmentHeader {
    key: boolean;
    index: number;
    count: number;
    seq: number;
    totalLength: number;
    timestamp: number;
}

export function Fragment(frame: EncodedFrame): ArrayBuffer[] {
    const count = Math.max(1, Math.ceil(frame.data.byteLength / MAX_PAYLOAD));
    const packets: ArrayBuffer[] = [];

    for (let index = 0; index < count; index++) {
        const slice = frame.data.subarray(index * MAX_PAYLOAD, (index + 1) * MAX_PAYLOAD);
        const buffer = new ArrayBuffer(HEADER_SIZE + slice.byteLength);
        const view = new DataView(buffer);
        view.setUint8(0, PACKET_FRAGMENT);
        view.setUint8(1, frame.key ? FLAG_KEY : 0);
        view.setUint16(2, index);
        view.setUint16(4, count);
        view.setUint32(8, frame.seq);
        view.setUint32(12, frame.data.byteLength);
        view.setFloat64(16, frame.timestamp);
        new Uint8Array(buffer, HEADER_SIZE).set(slice);
        packets.push(buffer);
    }
    return packets;
}

export function ReadHeader(packet: ArrayBuffer): FragmentHeader | null {
    if (packet.byteLength < HEADER_SIZE) return null;
    const view = new DataView(packet);
    if (view.getUint8(0) !== PACKET_FRAGMENT) return null;

    const header = {
        key: (view.getUint8(1) & FLAG_KEY) !== 0,
        index: view.getUint16(2),
        count: view.getUint16(4),
        seq: view.getUint32(8),
        totalLength: view.getUint32(12),
        timestamp: view.getFloat64(16),
    };
    if (header.count === 0 || header.index >= header.count) return null;
    if (header.totalLength > header.count * MAX_PAYLOAD) return null;
    return header;
}

/** Rebuilds whole frames from in-order fragments (data channels are reliable + ordered) */
export class Reassembler {
    private header: FragmentHeader | null = null;
    private data: Uint8Array | null = null;
    private next = 0;

    /** Returns the frame once its last fragment arrives */
    public Push(header: FragmentHeader, packet: ArrayBuffer): EncodedFrame | null {
        if (header.index === 0) {
            this.header = header;
            this.data = new Uint8Array(header.totalLength);
            this.next = 0;
        }
        if (!this.header || !this.data || header.seq !== this.header.seq || header.index !== this.next) {
            this.Reset();
            return null;
        }

        const payload = new Uint8Array(packet, HEADER_SIZE);
        const offset = header.index * MAX_PAYLOAD;
        if (offset + payload.byteLength > this.data.byteLength) {
            this.Reset();
            return null;
        }
        this.data.set(payload, offset);
        this.next++;

        if (this.next < header.count) return null;

        const frame = { seq: header.seq, key: header.key, timestamp: header.timestamp, data: this.data };
        this.Reset();
        return frame;
    }

    public Reset() {
        this.header = null;
        this.data = null;
        this.next = 0;
    }
}
