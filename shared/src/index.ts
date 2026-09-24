// Types shared between the server and the client.

/** Events the server sends to clients. */
export interface ServerToClientEvents {
  pong: (payload: { serverTime: number }) => void;
}

/** Events clients send to the server. */
export interface ClientToServerEvents {
  ping: () => void;
}
