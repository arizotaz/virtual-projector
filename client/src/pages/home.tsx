import { useEffect, useState } from "react";
import { socket } from "../socket";
import Navbar from "../components/navbar";

export default function Home() {
    const [connected, setConnected] = useState(socket.connected);
    const [lastPong, setLastPong] = useState<number | null>(null);

    useEffect(() => {
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onPong = ({ serverTime }: { serverTime: number }) => setLastPong(serverTime);

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("pong", onPong);
        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            socket.off("pong", onPong);
        };
    }, []);

    return (
        <>
            <Navbar />
            <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
                <h1>Virtual Projector</h1>
                <p>Socket: {connected ? "connected" : "disconnected"}</p>
                <button onClick={() => socket.emit("ping")} disabled={!connected}>
                    Ping server
                </button>
                {lastPong && <p>Last pong: {new Date(lastPong).toLocaleTimeString()}</p>}
            </main>
        </>
    );
}