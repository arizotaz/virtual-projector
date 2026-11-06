import { AuthUser } from "@virtual-projector/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { GetCurrentUser, GetHighRoleOfUser } from "../utilities/user";
import { HostStream, ViewerStream } from "./webrtc";

let ClassPage = () => {
    const { department, classname } = useParams();

    const [user, setUser] = useState<AuthUser | null>(null);
    const [perm, setPerm] = useState<number>(0);

    useEffect(() => {
        const controller = new AbortController();

        let LoadUser = async () => {
            const usr = await GetCurrentUser(controller.signal);
            if (!controller.signal.aborted) setUser(usr);
            const highest_perm = await GetHighRoleOfUser(usr);
            if (!controller.signal.aborted) setPerm(highest_perm);
        }
        LoadUser();

        return () => controller.abort();
    }, []);

    // Each class streams in its own room. Lowercase so /c/CS/101 and /c/cs/101 are the same class.
    const room = `${department}/${classname}`.toLowerCase();

    console.log(perm);

    // Teacher Page
    if (perm > 1) return <ClassTeacherScreen key={room} room={room} />;
    if (perm > 0) return <ClassStudentScreen key={room} room={room} />;
    return (
        <>
            {department}
            {classname}
        </>
    );
}

const ClassTeacherScreen = ({ room }: { room: string }) => {
    return <>
        <HostStream room={room} />
    </>;
}
const ClassStudentScreen = ({ room }: { room: string }) => {
    return <>
        <ViewerStream room={room} />
    </>;
}

export default ClassPage;