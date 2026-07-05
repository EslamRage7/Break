import { Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Break from "./components/Break";
import AdminTable from "./pages/AdminTable";
import BreaksTable from "./pages/BreaksTable";
import AttendanceTable from "./pages/AttendanceTable";
import EmployeeAttendancePage from "./pages/EmployeeAttendancePage";
import EmployeeBreaksPage from "./pages/EmployeeBreaksPage";
import Home from "./pages/Home";
import VerifyEmail from "./pages/VerifyEmail";
import Settings from "./pages/Settings";
import Preloader from "./components/Preloader";
import "./App.css";

function App() {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isPreloaderExiting, setIsPreloaderExiting] = useState(false);

  useEffect(() => {
    const path = location.pathname.toLowerCase();
    let title = "Mobile 2000";

    if (path === "/" || path === "/login") {
      title = "Login | Mobile 2000";
    } else if (path === "/register" || path === "/verify-email") {
      title = "Register | Mobile 2000";
    } else if (path === "/home") {
      title = "Home | Mobile 2000";
    } else if (path === "/settings") {
      title = "Settings | Mobile 2000";
    } else if (path === "/attendance") {
      title = "Attendance | Mobile 2000";
    } else if (path === "/breaks") {
      title = "Breaks | Mobile 2000";
    } else if (path === "/table") {
      title = "Admin Table | Mobile 2000";
    } else if (path === "/break") {
      title = "Break | Mobile 2000";
    } else if (path.startsWith("/employee-attendance/")) {
      title = "Employee Attendance | Mobile 2000";
    } else if (path.startsWith("/employee-breaks/")) {
      title = "Employee Breaks | Mobile 2000";
    }

    document.title = title;
  }, [location.pathname]);

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
          <Route path="/attendance" element={<AttendanceTable />} />
          <Route
            path="/employee-attendance/:userId"
            element={<EmployeeAttendancePage />}
          />
          <Route
            path="/employee-breaks/:userId"
            element={<EmployeeBreaksPage />}
          />
          <Route path="/break" element={<Break />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
