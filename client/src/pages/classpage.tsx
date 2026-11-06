import { AuthUser, ClassInfo } from "@virtual-projector/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { GetBackendStr } from "../utilities/browser_utils";
import { GetCurrentUser, GetHighRoleOfUser } from "../utilities/user";
import { HostStream, ViewerStream } from "./webrtc";

let ClassPage = () => {
    const { department, classname } = useParams();

    const [user, setUser] = useState<AuthUser | null>(null);
    const [perm, setPerm] = useState<number>(0);
    const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
    const [notFound, setNotFound] = useState(false);

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

    // Find the class this address points to, once we know who's asking
    const loggedIn = user !== null;
    useEffect(() => {
        setClassInfo(null);
        setNotFound(false);
        if (!loggedIn) return;

        const controller = new AbortController();
        let LoadClass = async () => {
            const response = await fetch(
                GetBackendStr(`/classes/${encodeURIComponent(department ?? "")}/${encodeURIComponent(classname ?? "")}`),
                { credentials: "include", signal: controller.signal },
            );
            if (controller.signal.aborted) return;
            if (!response.ok) return setNotFound(true);

            const data: { class: ClassInfo } = await response.json();
            if (!controller.signal.aborted) setClassInfo(data.class);
        }
        LoadClass().catch((e) => {
            if (!controller.signal.aborted) console.error("[-] Class Lookup Failed:", e);
        });

        return () => controller.abort();
    }, [department, classname, loggedIn]);

    if (notFound) return <p>Class not found</p>;

    // Each section streams in its own room, by CRN so changing the shorthand doesn't split a live class.
    const room = classInfo && `${classInfo.crn}/${classInfo.sectionid}`;

    // Teacher Page
    if (perm > 1) return room && <ClassTeacherScreen key={room} room={room} />;
    if (perm > 0) return room && <ClassStudentScreen key={room} room={room} />;
    
    console.log(classInfo);

    /**========================================================================
     * THIS IS A FALLBACK, IF THE USER IS NOT LOGGED IN THEN WE SHOW THE STREAM
     * HOWEVER IF THIS IS NOT INTENDED REPLAY THE RETURN STATEMENT BELOW
     * ========================================================================
     */
     return room && <ClassStudentScreen key={room} room={room} />;
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