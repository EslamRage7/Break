import { Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Break from "./components/Break";
import AdminTable from "./pages/AdminTable";
import BreaksTable from "./pages/BreaksTable";
import Home from "./pages/Home";
import VerifyEmail from "./pages/VerifyEmail";
import Settings from "./pages/Settings";
import Preloader from "./components/Preloader";
import "./App.css";

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isPreloaderExiting, setIsPreloaderExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsPreloaderExiting(true);
    }, 2200);

    const removeTimer = setTimeout(() => {
      setIsLoading(false);
    }, 2800);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (isLoading) {
    return <Preloader isExiting={isPreloaderExiting} />;
  }

  return (
    <div className="app-container">
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/Register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/register" element={<Register />} />
          <Route path="/home" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/table" element={<AdminTable />} />
          <Route path="/breaks" element={<BreaksTable />} />
          <Route path="/break" element={<Break />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
