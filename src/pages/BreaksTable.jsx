import { useEffect, useMemo, useState } from "react";
import { Alert, CircularProgress, Snackbar } from "@mui/material";
import Sidebar from "../components/Sidebar";
import { supabase } from "../supabaseClient";
import Footer from "../components/Footer";
const formatDateTime = (value) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatDuration = (minutes, seconds) => {
  if (!minutes && !seconds) return "-";

  const totalMinutes = minutes || 0;
  const totalSeconds = seconds || 0;

  if (!totalMinutes) return `${totalSeconds}s`;
  if (!totalSeconds) return `${totalMinutes}m`;

  return `${totalMinutes}m ${totalSeconds}s`;
};

export default function BreaksTable() {
  const [breaks, setBreaks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const showMessage = (message, severity = "info") => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const employeeNamesById = useMemo(() => {
    return employees.reduce((acc, employee) => {
      acc[employee.user_id] =
        `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
        employee.email ||
        employee.user_id;
      return acc;
    }, {});
  }, [employees]);

  useEffect(() => {
    const loadBreaks = async () => {
      setLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user?.id) throw new Error("Please login again");

        const { data: currentEmployee, error: currentEmployeeError } =
          await supabase
            .from("employees")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (currentEmployeeError) throw currentEmployeeError;

        if (currentEmployee?.role !== "admin") {
          setIsAdmin(false);
          return;
        }

        setIsAdmin(true);

        const { data: employeeRows, error: employeesError } = await supabase
          .from("employees")
          .select("user_id,first_name,last_name,email")
          .order("first_name", { ascending: true });

        if (employeesError) throw employeesError;

        const { data: breakRows, error: breaksError } = await supabase
          .from("break_sessions")
          .select(
            "id,user_id,start_time,end_time,duration_minutes,duration_seconds,used_minutes,used_seconds,status,is_paused,paused_at",
          )
          .order("start_time", { ascending: false });

        if (breaksError) throw breaksError;

        setEmployees(employeeRows || []);
        setBreaks(breakRows || []);
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Failed to load breaks table", "error");
      } finally {
        setLoading(false);
      }
    };

    loadBreaks();
  }, []);

  const getStatusLabel = (item) => {
    if (item.is_paused) return "Paused";
    if (item.status) return item.status;
    return "-";
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <h1>Breaks Table</h1>
          </div>

          {loading && (
            <div className="admin-loading">
              <CircularProgress size={30} />
              <span>Loading table...</span>
            </div>
          )}

          {!loading && !isAdmin && (
            <div className="admin-empty">
              You do not have permission to view this page.
            </div>
          )}

          {!loading && isAdmin && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Duration</th>
                    <th>Used</th>
                    <th>Status</th>
                    <th>Paused</th>
                  </tr>
                </thead>

                <tbody>
                  {breaks.map((item, index) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{index + 1}</strong>
                      </td>
                      <td>
                        <strong>
                          {employeeNamesById[item.user_id] || item.user_id}
                        </strong>
                      </td>
                      <td>{formatDateTime(item.start_time)}</td>
                      <td>{formatDateTime(item.end_time)}</td>
                      <td>{formatDuration(item.duration_minutes)}</td>
                      <td>{formatDuration(item.used_minutes)}</td>
                      <td>
                        <span
                          className={`table-pill ${
                            item.is_paused
                              ? "table-pill-neutral"
                              : item.status === "active"
                                ? "table-pill-success"
                                : "table-pill-neutral"
                          }`}
                        >
                          {getStatusLabel(item)}
                        </span>
                      </td>
                      <td className="paused-cell">
                        <span
                          className={`table-pill ${
                            item.is_paused
                              ? "table-pill-warning"
                              : "table-pill-success"
                          }`}
                        >
                          {item.is_paused ? "Yes" : "No"}
                        </span>

                        {item.is_paused && (
                          <small className="paused-date">
                            {formatDateTime(item.paused_at)}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Footer />
      </section>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() =>
          setSnackbar((prev) => ({
            ...prev,
            open: false,
          }))
        }
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
