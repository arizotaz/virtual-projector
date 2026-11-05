import { useParams } from "react-router-dom";

export default function CPage() {
    const { first, second } = useParams();

    return (
        <>
            <p>{first}</p>
            <p>{second}</p>
        </>
    );
}
