import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";

import Navbar from "./components/navbar";
import Home from "./pages/home";
import Login from "./pages/login";
import StudentPanel from "./pages/student";
import TeacherPanel from "./pages/teacher";
import AdminPanel from "./pages/administration";

import { GetBackendStr, UserData } from "./utilities/browser_utils";

export default function App() {
    const [user, setUser] = useState<UserData | undefined | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function GetUserInfo() {
            try {
                const response = await fetch(GetBackendStr("/me"), { credentials: "include" });
                const data = response.ok ? await response.json() : null;
                if (!cancelled) setUser(data?.user ?? undefined);
            } catch {
                if (!cancelled) setUser(undefined);
            }
        }

        GetUserInfo();
        return () => { cancelled = true; };
    }, []);

    return (
        <Router>
            <Navbar user={user} />
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/student" element={<StudentPanel />} />
                <Route path="/teacher" element={<TeacherPanel user={user} />} />
                <Route path="/admin" element={<AdminPanel user={user} />} />
            </Routes>
        </Router>
    );
}
