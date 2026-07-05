import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import { NavLink, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { supabase } from "../supabaseClient";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState("employee");
  const isAdmin = role === "admin";
  const isTeamLeader = role === "team_leader";
  const canManageEmployees = isAdmin || isTeamLeader;
  const [authUser, setAuthUser] = useState(null);
  const navigate = useNavigate();

  const closeSidebar = () => setIsOpen(false);

  useEffect(() => {
    const loadRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setAuthUser(user || null);
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

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        // close any open attendance by setting check_out and work_minutes
        const { data: openRow } = await supabase
          .from("attendance")
          .select("*")
          .eq("user_id", user.id)
          .is("check_out", null)
          .order("check_in", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openRow && openRow.check_in) {
          const now = new Date().toISOString();
          const minutes = Math.max(
            0,
            Math.floor((new Date(now) - new Date(openRow.check_in)) / 60000),
          );

          await supabase
            .from("attendance")
            .update({ check_out: now, work_minutes: minutes })
            .eq("id", openRow.id);
        }
      }
    } catch (e) {
      console.error("Failed to finalize attendance on logout", e);
    }

    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const handleCheckIn = async () => {
    closeSidebar();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        Swal.fire("Not signed in", "Please login first", "info");
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", user.id)
        .gte("check_in", `${today}T00:00:00`)
        .lt("check_in", `${today}T23:59:59`)
        .limit(1);

      await supabase
        .from("attendance")
        .insert([{ user_id: user.id, check_in: new Date().toISOString() }]);

      Swal.fire({
        title: "Checked In",
        text: "Your check-in was recorded",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to check in", "error");
    }
  };

  const handleCheckOut = async () => {
    closeSidebar();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        Swal.fire("Not signed in", "Please login first", "info");
        return;
      }

      const { data: openRow } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", user.id)
        .is("check_out", null)
        .order("check_in", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openRow) {
        Swal.fire(
          "No open session",
          "No active check-in found to check out from",
          "info",
        );
        return;
      }

      const now = new Date().toISOString();
      const minutes = Math.max(
        0,
        Math.floor((new Date(now) - new Date(openRow.check_in)) / 60000),
      );

      await supabase
        .from("attendance")
        .update({ check_out: now, work_minutes: minutes })
        .eq("id", openRow.id);

      Swal.fire({
        title: "Checked Out",
        text: `You worked ${minutes} minutes`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to check out", "error");
    }
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
            <PersonRoundedIcon fontSize="small" />
            <span>Profile</span>
          </NavLink>

          {canManageEmployees && (
            <>
              <NavLink
                to="/table"
                className={navLinkClass}
                onClick={closeSidebar}>
                <TableChartRoundedIcon fontSize="small" />
                <span>Employees</span>
              </NavLink>
            </>
          )}

          <NavLink
            to="/attendance"
            className={navLinkClass}
            onClick={closeSidebar}>
            <PeopleRoundedIcon fontSize="small" />
            <span>{isAdmin ? "Attendance Logs" : "My Attendance"}</span>
          </NavLink>

          {canManageEmployees && (
            <>
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
