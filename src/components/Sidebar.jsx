import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import { NavLink, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { supabase } from "../supabaseClient";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState("employee");
  const navigate = useNavigate();

  const closeSidebar = () => setIsOpen(false);

  useEffect(() => {
    const loadRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("employees")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      setRole(data?.role || "employee");
    };

    loadRole();
  }, []);

  const handleLogout = async () => {
    closeSidebar();

    const result = await Swal.fire({
      title: "Logout",
      text: "Are you sure you want to logout?",
      icon: "warning",
      iconColor: "#00a6eb",
      showCancelButton: true,
      confirmButtonText: "Yes, Logout",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      buttonsStyling: false,
      customClass: {
        popup: "logout-swal-popup",
        title: "logout-swal-title",
        confirmButton: "logout-swal-confirm",
        cancelButton: "logout-swal-cancel",
      },
    });

    if (!result.isConfirmed) return;

    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const navLinkClass = ({ isActive }) =>
    isActive ? "sidebar-link active" : "sidebar-link";

  return (
    <>
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        onClick={() => setIsOpen((open) => !open)}>
        {isOpen ? <CloseRoundedIcon /> : <MenuRoundedIcon />}
      </button>

      <button
        className={`sidebar-overlay ${isOpen ? "show" : ""}`}
        type="button"
        aria-label="Close menu"
        onClick={closeSidebar}
      />

      <aside className={`app-sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src={logo} alt="BreakApp" />
          <span>Mobile 2000</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink to="/home" className={navLinkClass} onClick={closeSidebar}>
            <HomeRoundedIcon fontSize="small" />
            <span>Home</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={navLinkClass}
            onClick={closeSidebar}>
            <SettingsRoundedIcon fontSize="small" />
            <span>Settings</span>
          </NavLink>

          {role === "admin" && (
            <>
              <NavLink
                to="/table"
                className={navLinkClass}
                onClick={closeSidebar}>
                <TableChartRoundedIcon fontSize="small" />
                <span>Employees</span>
              </NavLink>

              <NavLink
                to="/breaks"
                className={navLinkClass}
                onClick={closeSidebar}>
                <AccessTimeRoundedIcon fontSize="small" />
                <span>Breaks</span>
              </NavLink>
            </>
          )}
        </nav>

        <button className="sidebar-logout" type="button" onClick={handleLogout}>
          <LogoutRoundedIcon fontSize="small" />
          <span>Logout</span>
        </button>
      </aside>
    </>
  );
}
