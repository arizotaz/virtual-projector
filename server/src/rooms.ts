import type { Server } from "socket.io";
import {
    RELAY_MAX_CHILDREN,
    type ClientToServerEvents,
    type RelayRole,
    type RelaySignal,
    type RelayStatus,
    type RelayTree,
    type ServerToClientEvents,
} from "@virtual-projector/shared";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

interface TreeNode {
    id: string;
    role: RelayRole;
    parentId: string | null;
    children: string[];
    status: RelayStatus;
    joinedAt: number;
}

/** socket.io room that debug watchers of a relay room join */
const WatchChannel = (room: string) => `watch:${room}`;

/**
 * One relay tree. The source (host's fake client) is the root, and every
 * viewer receives the stream from exactly one parent and forwards it to up
 * to "RELAY_MAX_CHILDREN" children. The server only does signaling and
 * placement the actual media never passes through it
 */
class Room {
    public readonly name: string;
    private io: IO;
    private nodes = new Map<string, TreeNode>();
    private sourceId: string | null = null;
    // Viewers with no parent because there is no source yet
    private waiting: string[] = [];

    constructor(name: string, io: IO) {
        this.name = name;
        this.io = io;
    }

    public IsEmpty(): boolean {
        return this.nodes.size === 0;
    }

    public Join(id: string, role: RelayRole): string | null {
        if (this.nodes.has(id)) return "Already in this room";
        if (role === "source" && this.sourceId) return "Room already has a source";

        this.nodes.set(id, { id, role, parentId: null, children: [], status: "connecting", joinedAt: Date.now() });

        if (role === "source") {
            this.sourceId = id;
            const waiting = this.waiting;
            this.waiting = [];
            for (const waitingId of waiting) this.Place(waitingId);
        } else {
            this.Place(id);
        }

        this.BroadcastTree();
        return null;
    }

    public Leave(id: string) {
        const node = this.nodes.get(id);
        if (!node) return;

        if (node.parentId) this.Detach(id);
        this.waiting = this.waiting.filter((w) => w !== id);
        this.nodes.delete(id);
        if (this.sourceId === id) this.sourceId = null;

        // Re-home each orphan. It keeps its own children, so only this one
        // level of the branch has to reconnect
        for (const childId of node.children) {
            const child = this.nodes.get(childId);
            if (!child) continue;
            child.parentId = null;
            this.Place(childId);
        }

        this.BroadcastTree();
    }

    public ParentFailed(id: string) {
        const node = this.nodes.get(id);
        if (!node || !node.parentId) return;

        const failedParent = node.parentId;
        this.Detach(id);
        this.Place(id, failedParent);
        this.BroadcastTree();
    }

    public SetStatus(id: string, status: RelayStatus) {
        const node = this.nodes.get(id);
        if (!node || node.status === status) return;
        node.status = status;
        this.BroadcastTree();
    }

    public GetTree(): RelayTree {
        const nodes = [...this.nodes.values()].map(({ id, role, parentId, status, joinedAt }) => ({
            id, role, parentId, status, joinedAt,
        }));
        return { room: this.name, sourceId: this.sourceId, nodes };
    }

    /** Only allow signaling along an edge of the tree */
    public RelaySignal(from: string, to: string, signal: RelaySignal) {
        const a = this.nodes.get(from);
        const b = this.nodes.get(to);
        if (!a || !b) return;
        if (a.parentId !== to && b.parentId !== from) return;

        this.io.to(to).emit("relay:signal", { from, signal });
    }

    /** Attach a parentless node under the shallowest node that has a free slot */
    private Place(id: string, avoid?: string) {
        const parentId = this.FindParent(id, avoid) ?? (avoid ? this.FindParent(id) : null);

        if (!parentId) {
            if (!this.waiting.includes(id)) this.waiting.push(id);
            this.io.to(id).emit("relay:set-parent", { parentId: null });
            return;
        }

        const node = this.nodes.get(id)!;
        const parent = this.nodes.get(parentId)!;
        node.parentId = parentId;
        parent.children.push(id);

        this.io.to(id).emit("relay:set-parent", { parentId });
        this.io.to(parentId).emit("relay:add-child", { childId: id });
    }

    private Detach(id: string) {
        const node = this.nodes.get(id);
        if (!node || !node.parentId) return;

        const parent = this.nodes.get(node.parentId);
        if (parent) {
            parent.children = parent.children.filter((c) => c !== id);
            this.io.to(parent.id).emit("relay:remove-child", { childId: id });
        }
        node.parentId = null;
    }

    // Breadth-first from the source so the tree stays as shallow as possible.
    // `id` is skipped so a node is never placed inside its own subtree
    private FindParent(id: string, avoid?: string): string | null {
        if (!this.sourceId) return null;

        const queue = [this.sourceId];
        while (queue.length > 0) {
            const candidate = this.nodes.get(queue.shift()!);
            if (!candidate || candidate.id === id) continue;
            if (candidate.id !== avoid && candidate.children.length < RELAY_MAX_CHILDREN) {
                return candidate.id;
            }
            queue.push(...candidate.children);
        }
        return null;
    }

    public BroadcastTree() {
        const tree = this.GetTree();
        this.io.to(WatchChannel(this.name)).emit("room:tree", tree);
        if (this.sourceId) this.io.to(this.sourceId).emit("room:tree", tree);
    }
}

class RoomManager {
    private io: IO;
    private rooms = new Map<string, Room>();
    private memberships = new Map<string, Room>();

    constructor(io: IO) {
        this.io = io;
    }

    public Join(socketID: string, roomName: string, role: RelayRole): string | null {
        this.Leave(socketID);

        let room = this.rooms.get(roomName);
        if (!room) {
            room = new Room(roomName, this.io);
            this.rooms.set(roomName, room);
        }

        const error = room.Join(socketID, role);
        if (error) {
            if (room.IsEmpty()) this.rooms.delete(roomName);
            return error;
        }

        this.memberships.set(socketID, room);
        return null;
    }

    public Leave(socketID: string) {
        const room = this.memberships.get(socketID);
        if (!room) return;

        room.Leave(socketID);
        this.memberships.delete(socketID);
        if (room.IsEmpty()) this.rooms.delete(room.name);
    }

    public GetTree(roomName: string): RelayTree {
        return this.rooms.get(roomName)?.GetTree() ?? { room: roomName, sourceId: null, nodes: [] };
    }

    public WatchChannel(roomName: string): string {
        return WatchChannel(roomName);
    }

    public GetRoom(socketID: string): Room | undefined {
        return this.memberships.get(socketID);
    }
}

export { RoomManager };
