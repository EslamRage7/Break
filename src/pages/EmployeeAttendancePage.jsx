import { useEffect, useMemo, useState } from "react";
import { Alert, CircularProgress, Snackbar } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import Typography from "@mui/material/Typography";
const formatDateTime = (value) => {
  if (!value) return "-";

  const text = `${value}`.trim();
  if (!text) return "-";

  const timeOnlyMatch = text.match(/^\d{1,2}:\d{2}(?::\d{2})?$/);
  if (timeOnlyMatch) {
    return text;
  }

  const isoMatch = text.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)(?:Z|[+-]\d{2}:\d{2})?$/,
  );

  if (isoMatch) {
    const [, datePart, timePart] = isoMatch;
    const normalizedValue = `${datePart}T${timePart.replace(/\.\d+$/, "")}`;
    const parsedDate = new Date(normalizedValue);

    if (!Number.isNaN(parsedDate.getTime())) {
      return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Cairo",
      }).format(parsedDate);
    }
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    }).format(parsedDate);
  }

  return text;
};

export default function EmployeeAttendancePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const employeeName = useMemo(() => {
    if (!employee) return userId || "Employee";
    return (
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.email ||
      userId ||
      "Employee"
    );
  }, [employee, userId]);

  const pageTitle = useMemo(() => {
    if (!userId) return "Attendance History";
    if (employee?.first_name || employee?.last_name || employee?.email) {
      return ` Attendance History`;
    }
    return "Employee Attendance History";
  }, [employee, employeeName, userId]);

  useEffect(() => {
    document.title = pageTitle;
    return () => {
      document.title = "Break";
    };
  }, [pageTitle]);

  useEffect(() => {
    const loadData = async () => {
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

        const { data: employeeRows, error: employeeError } = await supabase
          .from("employees")
          .select("user_id,email,first_name,last_name,department,role")
          .eq("user_id", userId)
          .maybeSingle();

        if (employeeError) throw employeeError;
        setEmployee(employeeRows);

        const { data: logsData, error: logsError } = await supabase
          .from("attendance")
          .select(
            "id,user_id,check_in,check_out,work_minutes,status,created_at",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (logsError) throw logsError;
        setLogs(logsData || []);
      } catch (err) {
        console.error(err);
        setSnackbar({
          open: true,
          message: err.message || "Failed to load employee attendance",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadData();
    }
  }, [userId]);

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a" }}>
              {pageTitle}
            </Typography>
          </div>
          <br />
          <button
            className="back-btn btn"
            type="button"
            onClick={() => navigate("/attendance")}
            style={{
              marginBottom: 16,
              marginTop: 16,
              border: "1px solid #d0d7de",
              background: "#fff",
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}>
            ← Back to attendance
          </button>

          {loading && (
            <div className="admin-loading">
              <CircularProgress size={30} />
              <span>Loading employee history...</span>
            </div>
          )}

          {!loading && !isAdmin && (
            <div className="admin-empty">
              You do not have permission to view this page.
            </div>
          )}

          {!loading && isAdmin && (
            <div>
              <div style={{ marginBottom: 12, fontWeight: 700 }}>
                Attendance of
                <span style={{ color: "#00a6eb", margin: "0 8px" }}>
                  {employeeName}
                </span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="text-center">Check In</th>
                      <th className="text-center">Check Out</th>
                      <th className="text-center">Minutes</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          No attendance history found for this employee.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log, index) => (
                        <tr key={log.id}>
                          <td>
                            <strong>{index + 1}</strong>
                          </td>
                          <td className="text-center">
                            {formatDateTime(log.check_in)}
                          </td>
                          <td className="text-center">
                            {formatDateTime(log.check_out)}
                          </td>
                          <td className="text-center">
                            {log.work_minutes || 0}
                          </td>
                          <td className="text-center">
                            <span
                              className={`table-pill ${
                                !log.check_in
                                  ? "table-pill-danger"
                                  : log.check_in && !log.check_out
                                    ? "table-pill-success"
                                    : "table-pill-neutral"
                              }`}>
                              {!log.check_in
                                ? "Absent"
                                : log.check_in && !log.check_out
                                  ? "Working"
                                  : "Shift Finished"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <Footer />
      </section>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
