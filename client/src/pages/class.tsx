import { useParams } from "react-router-dom";
import Navbar from "../components/navbar";
import { UserData } from "../utilities/browser_utils";

let ClassPage = ({ user }: { user: UserData | undefined | null }) => {
    const { department, classname } = useParams();



    return (
        <>


        </>
    );
}



let TeacherHost = () => {
    return (
        <>
        </>
    );
}
let StudentView = () => {
    return (
        <>
        </>
    );
}


export default ClassPage;