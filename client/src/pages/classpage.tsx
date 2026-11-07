import { ClassInfo } from "@virtual-projector/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { GetBackendStr } from "../utilities/browser_utils";
import { HostStream, ViewerStream } from "./webrtc";

let ClassPage = () => {
    const { department, classname } = useParams();

    const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
    const [notFound, setNotFound] = useState(false);

    // Find the class this address points to. The server decides who can see it and who hosts it,
    // since only it knows whether ANONYMOUS_CLIENTS is on.
    useEffect(() => {
        setClassInfo(null);
        setNotFound(false);

        const controller = new AbortController();
        let LoadClass = async () => {
            const response = await fetch(
                GetBackendStr(`/classes/${encodeURIComponent(department ?? "")}/${encodeURIComponent(classname ?? "")}`),
                { credentials: "include", signal: controller.signal },
            );
            if (controller.signal.aborted || response.status === 401) return;
            if (!response.ok) return setNotFound(true);

            const data: { class: ClassInfo } = await response.json();
            if (!controller.signal.aborted) setClassInfo(data.class);
        }
        LoadClass().catch((e) => {
            if (!controller.signal.aborted) console.error("[-] Class Lookup Failed:", e);
        });

        return () => controller.abort();
    }, [department, classname]);

    if (notFound) return <p>Class not found</p>;
    if (!classInfo) return null;

    // Each section streams in its own room, by CRN so changing the shorthand doesn't split a live class.
    const room = `${classInfo.crn}/${classInfo.sectionid}`;

    if (classInfo.can_host) return <ClassTeacherScreen key={room} room={room} />;
    return <ClassStudentScreen key={room} room={room} />;
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