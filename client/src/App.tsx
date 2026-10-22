import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Navbar from './components/navbar'

import Home from './pages/home';
import Login from './pages/login';

import TeacherPanel from './pages/teacher';
import AdminPanel from './pages/administration';

export default function App() {
  return (
    <>
        <Navbar />
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />

                <Route path="/teacher" element={<TeacherPanel />} />
                <Route path="/admin" element={<AdminPanel />} />
            </Routes>
        </Router>
    </>
  );
}
