// Types shared between the server and the client

/** The logged in user, as returned by /api/login and /api/session */
export interface AuthUser {
  id: string;
  name: string;
  initial: string;
  email: string;
  roles: { id: number; name: string }[];
}

/** Max number of downstream peers a single relay node forwards to */
export const RELAY_MAX_CHILDREN = 3;

/** "source" is the host's fake client at the top of the tree; everyone else is a "viewer" */
export type RelayRole = "source" | "viewer";

/** WebRTC signaling payloads, relayed by the server between a parent and its direct child */
export type RelaySignal =
  | { type: "offer" | "answer"; sdp: string }
  | {
      type: "candidate";
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };

export type RelayStatus = "connecting" | "waiting" | "receiving" | "live" | "error";

export interface RelayTreeNode {
  id: string;
  role: RelayRole;
  parentId: string | null;
  status: RelayStatus;
  joinedAt: number;
}

export interface RelayTree {
  room: string;
  sourceId: string | null;
  nodes: RelayTreeNode[];
}

export type JoinRoomResult = { ok: true; nodeId: string } | { ok: false; error: string };

/** Events the server sends to clients */
export interface ServerToClientEvents {
  pong: (payload: { serverTime: number }) => void;

  /** Who this node should receive the stream from. null = no source yet, wait */
  "relay:set-parent": (payload: { parentId: string | null }) => void;
  /** This node should start forwarding to a new child (parent sends the offer) */
  "relay:add-child": (payload: { childId: string }) => void;
  /** This node should stop forwarding to a child */
  "relay:remove-child": (payload: { childId: string }) => void;
  "relay:signal": (payload: { from: string; signal: RelaySignal }) => void;
  /** Current tree layout, sent to the room's source and to debug watchers */
  "room:tree": (payload: RelayTree) => void;
}

/** Events clients send to the server. */
export interface ClientToServerEvents {
  ping: () => void;

  "room:join": (
    payload: { room: string; role: RelayRole },
    ack: (result: JoinRoomResult) => void,
  ) => void;
  "room:leave": () => void;
  "relay:signal": (payload: { to: string; signal: RelaySignal }) => void;
  /** The connection to the current parent failed; ask for a different one */
  "relay:parent-failed": () => void;
  /** This node's own connection status, shown on the debug page */
  "relay:status": (payload: { status: RelayStatus }) => void;

  /** Debug: receive "room:tree" for a room whenever it changes */
  "room:watch": (payload: { room: string }) => void;
  "room:unwatch": (payload: { room: string }) => void;
}
