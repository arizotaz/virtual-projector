import { useEffect, useState } from "react";
import { socket } from "../socket";
import Navbar from "../components/navbar";
import { UserData } from "../utilities/browser_utils";

export default function Home({ user }: { user: UserData | undefined | null }) {
    const [connected, setConnected] = useState(socket.connected);
    const [lastPong, setLastPong] = useState<number | null>(null);

    return (
        <>
            <Navbar user={user} />
        </>
    );
}