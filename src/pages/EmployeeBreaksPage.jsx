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
    const normalizedValue = `${datePart}T${timePart.replace(/\.\d+$/, "")}Z`;
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

const formatDuration = (minutes, seconds) => {
  if (!minutes && !seconds) return "-";

  const totalMinutes = minutes || 0;
  const totalSeconds = seconds || 0;

  if (!totalMinutes) return `${totalSeconds}s`;
  if (!totalSeconds) return `${totalMinutes}m`;

  return `${totalMinutes}m ${totalSeconds}s`;
};

export default function EmployeeBreaksPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [breaks, setBreaks] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const showMessage = (message, severity = "info") => {
    setSnackbar({ open: true, message, severity });
  };

  const employeeName = useMemo(() => {
    if (!employee) return userId;
    return (
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.email ||
      userId
    );
  }, [employee, userId]);

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

        const { data: adminData, error: adminError } =
          await supabase.functions.invoke("admin-data");

        if (adminError) throw adminError;

        const employeeRows = adminData?.employees || [];
        const selectedEmployee =
          employeeRows.find((item) => item.user_id === userId) || null;

        setEmployee(selectedEmployee);

        const employeeBreaks = (adminData?.breaks || []).filter(
          (item) => item.user_id === userId,
        );
        setBreaks(
          employeeBreaks.sort(
            (a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0),
          ),
        );
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Failed to load employee breaks", "error");
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadData();
    }
  }, [userId]);

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
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a" }}>
              Employee Break History
            </Typography>

            <Typography variant="body2" sx={{ mt: 0.5, color: "#64748b" }}>
              View the complete break history for the selected employee,
              including duration and status.
            </Typography>
          </div>

          <br />

          <button
            className="back-btn btn"
            type="button"
            onClick={() => navigate("/breaks")}
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
            ← Back to all breaks
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
          <div style={{ marginBottom: 12, fontWeight: 700 }}>
            Breaks of <span style={{ color: "#00a6eb" }}>{employeeName}</span>
          </div>

          {!loading && isAdmin && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="text-center">Start Time</th>
                    <th className="text-center">End Time</th>
                    <th className="text-center">Duration</th>
                    <th className="text-center">Used</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {breaks.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No breaks found for this employee.</td>
                    </tr>
                  ) : (
                    breaks.map((item, index) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{index + 1}</strong>
                        </td>
                        <td className="text-center">
                          {formatDateTime(item.start_time)}
                        </td>
                        <td className="text-center">
                          {formatDateTime(item.end_time)}
                        </td>
                        <td className="text-center">
                          {formatDuration(item.duration_minutes)}
                        </td>
                        <td className="text-center">
                          {formatDuration(item.used_minutes)}
                        </td>
                        <td className="text-center">
                          <span
                            className={`table-pill  ${
                              item.is_paused
                                ? "table-pill-neutral"
                                : item.status === "active"
                                  ? "table-pill-success"
                                  : "table-pill-neutral"
                            }`}>
                            {getStatusLabel(item)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
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
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
