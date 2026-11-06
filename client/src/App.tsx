import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";

import './App.css';

import AdminGuard from "./components/AdminGuard";
import NotFound from "./pages/not_found";

import Home from "./pages/home";
import Login from "./pages/login";

import AdminPanel from "./pages/admin/home";
import ViewClasses from "./pages/admin/view/classes";
import ViewTeachers from "./pages/admin/view/teachers";
import ViewStudents from "./pages/admin/view/students";
import AddClass from "./pages/admin/creation/create_class";
import AddTeacher from "./pages/admin/creation/create_teacher";
import AddStudent from "./pages/admin/creation/create_student";

import CPage from "./pages/c";

import { GetBackendStr, UserData } from "./utilities/browser_utils";
import ClassPage from "./pages/class";

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
            <Routes>
                <Route path="/" element={<Home user={user} />} />
                <Route path="/login" element={<Login />} />
                
                <Route path="/admin" element={<AdminGuard user={user} />}>
                    <Route index element={<AdminPanel user={user} />} />

                    {/* Equivilant to: /admin/classes */}
                    <Route path="classes" element={<ViewClasses user={user} />} />
                    <Route path="classes/create" element={<AddClass user={user} />} />

                    <Route path="teachers" element={<ViewTeachers user={user} />} />
                    <Route path="teachers/create" element={<AddTeacher user={user} />} />

                    <Route path="students" element={<ViewStudents user={user} />} />
                    <Route path="students/create" element={<AddStudent user={user} />} />
                </Route>

                <Route path="/c/:department/:classname" element={<ClassPage user={user} />} />

                <Route path="*" element={<NotFound />} />
            </Routes>
        </Router>
    );
}
