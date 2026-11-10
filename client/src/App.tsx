import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Navbar from './components/navbar'
import NotFound from './pages/not_found';

import Home from './pages/home';
import Login from './pages/login';
import { WebRTCClientPage, WebRTCDebugPage, WebRTCHostPage } from './pages/webrtc';
import ClassPage from './pages/classpage';
import { STUDENT_ROLE_ID, TEACHER_ROLE_ID } from '@virtual-projector/shared';
import { AdminLayout, AdminOverview } from './pages/admin/layout';
import { AdminUserDetail, AdminUserList } from './pages/admin/users';
import { AdminClassDetail, AdminClassList, AdminSectionDetail } from './pages/admin/classes';

export default function App() {
    return (
        <>
            <Router>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={<Login />} />

                    <Route path="/webrtc/client" element={<WebRTCClientPage />} />
                    <Route path="/webrtc/host" element={<WebRTCHostPage />} />
                    <Route path="/webrtc/debug" element={<WebRTCDebugPage />} />

                    <Route path="/c/:department/:classname" element={<ClassPage />} />

                    <Route path="/admin" element={<AdminLayout />}>
                        <Route index element={<AdminOverview />} />
                        <Route path="users" element={<AdminUserList title="All Users" kind="user" />} />
                        <Route path="students" element={<AdminUserList title="Students" kind="student" roleId={STUDENT_ROLE_ID} />} />
                        <Route path="teachers" element={<AdminUserList title="Teachers" kind="teacher" roleId={TEACHER_ROLE_ID} />} />

                        <Route path="user/:id" element={<AdminUserDetail />} />
                        <Route path="student/:id" element={<AdminUserDetail />} />
                        <Route path="teacher/:id" element={<AdminUserDetail />} />

                        <Route path="classes" element={<AdminClassList />} />
                        <Route path="class/:crn" element={<AdminClassDetail />} />
                        <Route path="class/:crn/section/:sectionid" element={<AdminSectionDetail />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Router>
        </>
    );
}
