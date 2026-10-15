import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Navbar from './components/navbar'

import Home from './pages/home';
import Login from './pages/login';

export default function App() {
  return (
    <>
        <Navbar />
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
            </Routes>
        </Router>
    </>
  );
}
