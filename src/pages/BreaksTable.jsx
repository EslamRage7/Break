import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  CircularProgress,
  Snackbar,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { supabase } from "../supabaseClient";
import Footer from "../components/Footer";
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

    const formatDateTime = (value) => {
      if (!value) return "-";

      const date = new Date(value);

      if (isNaN(date.getTime())) return "-";

      return date.toLocaleString("en-GB", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    };
    const parsedDate = new Date(formatDateTime);

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

export default function BreaksTable() {
  const [breaks, setBreaks] = useState([]);
  const [nameQuery, setNameQuery] = useState("");
  const [dayQuery, setDayQuery] = useState("");
  const [statusQuery, setStatusQuery] = useState("all");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
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

        const { data: adminData, error: adminError } =
          await supabase.functions.invoke("admin-data");

        if (adminError) throw adminError;

        const employeeRows = adminData?.employees || [];
        const breakRows = adminData?.breaks || [];

        setEmployees(employeeRows);
        const latestBreaks = {};

        breakRows.forEach((item) => {
          if (!latestBreaks[item.user_id]) {
            latestBreaks[item.user_id] = item;
          }
        });

        setBreaks(Object.values(latestBreaks));
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Failed to load breaks table", "error");
      } finally {
        setLoading(false);
      }
    };

    loadBreaks();
  }, []);

  const filteredBreaks = useMemo(() => {
    return (breaks || []).filter((item) => {
      // filter by selected employee id (nameQuery holds user_id when selected)
      if (nameQuery) {
        if (item.user_id !== nameQuery) return false;
      }

      // filter by day (YYYY-MM-DD)
      if (dayQuery) {
        const itemDay = item.start_time ? item.start_time.split("T")[0] : "";
        if (itemDay !== dayQuery) return false;
      }

      // filter by status
      if (statusQuery && statusQuery !== "all") {
        if (statusQuery === "paused") {
          if (!item.is_paused) return false;
        } else {
          if ((item.status || "").toLowerCase() !== statusQuery) return false;
        }
      }

      return true;
    });
  }, [breaks, nameQuery, dayQuery, statusQuery]);

  const employeesInBreaks = useMemo(() => {
    const ids = new Set((breaks || []).map((b) => b.user_id));
    return (employees || [])
      .filter((e) => ids.has(e.user_id))
      .sort((a, b) => {
        const A = `${a.first_name || ""} ${a.last_name || ""}`
          .trim()
          .toLowerCase();
        const B = `${b.first_name || ""} ${b.last_name || ""}`
          .trim()
          .toLowerCase();
        return A.localeCompare(B);
      });
  }, [breaks, employees]);

  const availableDates = useMemo(() => {
    const set = new Set();
    (breaks || []).forEach((b) => {
      if (b.start_time) set.add(b.start_time.split("T")[0]);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [breaks]);

  const getStatusLabel = (item) => {
    if (item.is_paused) return "Paused";
    if ((item.status || "").toLowerCase() === "completed") return "Completed";
    if ((item.status || "").toLowerCase() === "active") return "Active";
    return item.status || "-";
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <h1>All Breaks</h1>
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
            <div>
              <div
                className="table-filters"
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}>
                <FormControl size="small" style={{ minWidth: 220 }}>
                  <InputLabel id="employee-select-label">Employee</InputLabel>
                  <Select
                    labelId="employee-select-label"
                    label="Employee"
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}>
                    <MenuItem value="">All employees</MenuItem>
                    {employeesInBreaks.map((emp) => (
                      <MenuItem value={emp.user_id} key={emp.user_id}>
                        {`${emp.first_name || ""} ${emp.last_name || ""}`.trim() ||
                          emp.email ||
                          emp.user_id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" style={{ minWidth: 180 }}>
                  <InputLabel id="date-select-label">Date</InputLabel>
                  <Select
                    labelId="date-select-label"
                    label="Date"
                    value={dayQuery}
                    onChange={(e) => setDayQuery(e.target.value)}>
                    <MenuItem value="">All dates</MenuItem>
                    {availableDates.map((d) => (
                      <MenuItem value={d} key={d}>
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeZone: "Africa/Cairo",
                        }).format(new Date(d))}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" style={{ minWidth: 160 }}>
                  <InputLabel id="status-select-label">Status</InputLabel>
                  <Select
                    labelId="status-select-label"
                    label="Status"
                    value={statusQuery}
                    onChange={(e) => setStatusQuery(e.target.value)}>
                    <MenuItem value="all">All statuses</MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="completed">Completed</MenuItem>
                    <MenuItem value="paused">Paused</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setNameQuery("");
                    setDayQuery("");
                    setStatusQuery("all");
                  }}
                  sx={{
                    height: 40,
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 600,
                  }}>
                  Clear
                </Button>
              </div>

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
                    {filteredBreaks.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{ textAlign: "center", padding: 20 }}>
                          No breaks match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredBreaks.map((item, index) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{index + 1}</strong>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/employee-breaks/${item.user_id}`)
                              }
                              style={{
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                color: "#0ea5e9",
                                cursor: "pointer",
                                fontWeight: 600,
                                textAlign: "left",
                              }}>
                              {employeeNamesById[item.user_id] || item.user_id}
                            </button>
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
                                  : (item.status || "").toLowerCase() ===
                                      "active"
                                    ? "table-pill-success"
                                    : "table-pill-neutral"
                              }`}>
                              {getStatusLabel(item)}
                            </span>
                          </td>
                          <td className="paused-cell">
                            <span
                              className={`table-pill ${
                                item.is_paused
                                  ? "table-pill-warning"
                                  : "table-pill-success"
                              }`}>
                              {item.is_paused ? "Yes" : "No"}
                            </span>

                            {item.is_paused && (
                              <small className="paused-date">
                                {formatDateTime(item.paused_at)}
                              </small>
                            )}
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
        onClose={() =>
          setSnackbar((prev) => ({
            ...prev,
            open: false,
          }))
        }
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}>
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
