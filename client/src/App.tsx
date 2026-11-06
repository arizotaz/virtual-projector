import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Navbar from './components/navbar'

import Home from './pages/home';
import Login from './pages/login';
import { WebRTCClientPage, WebRTCDebugPage, WebRTCHostPage } from './pages/webrtc';
import ClassPage from './pages/classpage';

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
                </Routes>
            </Router>
        </>
    );
}
