import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
} from "@mui/material";
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

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(parsedDate);
  }

  return text;
};

const formatDateOnly = (value) => {
  if (!value) return "-";

  const text = `${value}`.trim();
  if (!text) return "-";

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(parsedDate);
  }

  return text;
};

const formatWorkDuration = (workMinutes, overtimeMinutes) => {
  const work = Number(workMinutes) || 0;
  const overtime = Number(overtimeMinutes) || 0;

  if (!work) return "-";

  const workHours = Math.floor(work / 60);
  const workMins = work % 60;

  let result = "";

  if (workHours && workMins) {
    result = `${workHours}h ${workMins}m`;
  } else if (workHours) {
    result = `${workHours}h`;
  } else {
    result = `${workMins}m`;
  }

  if (overtime > 0) {
    const otHours = Math.floor(overtime / 60);
    const otMins = overtime % 60;

    let otText = "";

    if (otHours && otMins) {
      otText = `${otHours}h ${otMins}m`;
    } else if (otHours) {
      otText = `${otHours}h`;
    } else {
      otText = `${otMins}m`;
    }

    result += ` + ${otText}`;
  }

  return result;
};
const formatMinutes = (minutes) => {
  const totalMinutes = Number(minutes) || 0;

  if (!totalMinutes) return "-";

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const getCheckOutType = (status) => {
  if (!status) return { type: "-", color: "#94a3b8", bg: "#f1f5f9" };

  const statusStr = `${status}`.toLowerCase();

  if (statusStr.includes("system")) {
    return {
      type: "System",
      label: "Check out تلقائي",
      color: "#ea580c",
      bg: "#fed7aa",
      borderColor: "#fdba74",
    };
  }

  return {
    type: "Manual",
    label: "Check out يدوي",
    color: "#0891b2",
    bg: "#cffafe",
    borderColor: "#06b6d4",
  };
};

const getEarlyMinutes = (log) => {
  const directValue = Number(log.early_minutes ?? log.early_arrival_minutes);
  if (Number.isFinite(directValue) && directValue > 0) {
    return directValue;
  }

  if (!log.check_in || !log.shift_start) return 0;

  const checkIn = new Date(log.check_in);
  if (Number.isNaN(checkIn.getTime())) return 0;

  const shiftStartText = `${log.shift_start}`.trim();
  const shiftStartMatch = shiftStartText.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (shiftStartMatch) {
    const shiftDate = new Date(checkIn);
    shiftDate.setHours(
      Number(shiftStartMatch[1]),
      Number(shiftStartMatch[2]),
      Number(shiftStartMatch[3] || 0),
      0,
    );

    const diffMinutes = Math.round((shiftDate - checkIn) / 60000);
    return diffMinutes > 0 ? diffMinutes : 0;
  }

  const shiftStartDate = new Date(shiftStartText);
  if (Number.isNaN(shiftStartDate.getTime())) return 0;

  const diffMinutes = Math.round((shiftStartDate - checkIn) / 60000);
  return diffMinutes > 0 ? diffMinutes : 0;
};

export default function EmployeeAttendancePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
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

  const availableDates = useMemo(() => {
    const dates = logs
      .map((log) => {
        const rawValue = log.attendance_date || log.check_in || log.created_at;
        if (!rawValue) return "";

        const parsedDate = new Date(rawValue);
        if (Number.isNaN(parsedDate.getTime())) return "";

        return `${parsedDate.getFullYear()}-${String(
          parsedDate.getMonth() + 1,
        ).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
      })
      .filter(Boolean);

    return [...new Set(dates)].sort((a, b) => b.localeCompare(a));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!dateFilter) return logs;

    return logs.filter((log) => {
      const rawValue = log.attendance_date || log.check_in || log.created_at;
      if (!rawValue) return false;

      const parsedDate = new Date(rawValue);
      if (Number.isNaN(parsedDate.getTime())) return false;

      const value = `${parsedDate.getFullYear()}-${String(
        parsedDate.getMonth() + 1,
      ).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;

      return value === dateFilter;
    });
  }, [dateFilter, logs]);

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
            .select("role, team_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (currentEmployeeError) throw currentEmployeeError;

        // Allow admin and team leader to view
        if (
          currentEmployee?.role !== "admin" &&
          currentEmployee?.role !== "team_leader"
        ) {
          setIsAdmin(false);
          return;
        }

        setIsAdmin(true);

        const { data: employeeRows, error: employeeError } = await supabase
          .from("employees")
          .select("user_id,email,first_name,last_name,department,role,team_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (employeeError) throw employeeError;

        // For team leaders, check if employee is in their team
        if (currentEmployee?.role === "team_leader") {
          if (
            !employeeRows ||
            employeeRows.team_id !== currentEmployee.team_id
          ) {
            setIsAdmin(false);
            return;
          }
        }

        setEmployee(employeeRows);

        const { data: logsData, error: logsError } = await supabase
          .from("attendance")
          .select(
            "id,user_id,check_in,check_out,work_minutes,status,created_at,early_minutes,overtime_minutes,attendance_date,shift_name,shift_start,early_arrival_minutes,late_minutes",
          )
          .eq("user_id", userId)
          .not("check_out", "is", null)
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

            <Typography variant="body2" sx={{ mt: 0.5, color: "#64748b" }}>
              Review the selected employee's attendance records, check-in and
              check-out times, and work duration.
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

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 16,
                  alignItems: "center",
                }}>
                <FormControl size="small" style={{ minWidth: 180 }}>
                  <InputLabel id="attendance-date-filter-label">
                    Date
                  </InputLabel>
                  <Select
                    labelId="attendance-date-filter-label"
                    label="Date"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}>
                    <MenuItem value="">All dates</MenuItem>
                    {availableDates.map((date) => (
                      <MenuItem value={date} key={date}>
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeZone: "Africa/Cairo",
                        }).format(new Date(`${date}T00:00:00`))}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setDateFilter("")}
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
                      <th className="text-center">#</th>
                      <th className="text-center">Shift</th>
                      <th className="text-center">Check In</th>
                      <th className="text-center">Check Out</th>

                      <th className="text-center">Early</th>
                      <th className="text-center">Late</th>
                      <th className="text-center">Hours</th>
                      <th className="text-center">Overtime</th>
                      <th className="text-center">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={9}>
                          No attendance history found for this employee.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log, index) => (
                        <tr key={log.id}>
                          <td className="text-center">
                            <strong>{index + 1}</strong>
                          </td>
                          <td className="text-center">
                            {log.shift_name || "-"}
                          </td>
                          <td className="text-center">
                            {formatDateTime(log.check_in)}
                          </td>
                          <td className="text-center">
                            {formatDateTime(log.check_out)}
                          </td>
                          <td className="text-center">
                            <div
                              style={{
                                display: "inline-flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "6px",
                                flexWrap: "nowrap",
                                whiteSpace: "nowrap",
                              }}>
                              {(() => {
                                const earlyMinutes = getEarlyMinutes(log);
                                if (!earlyMinutes) return <span>-</span>;

                                return (
                                  <span
                                    style={{
                                      padding: "6px 8px",
                                      borderRadius: 999,
                                      background: "#dbeafe",
                                      color: "#1d4ed8",
                                      fontWeight: 700,
                                      border: "1px solid #93c5fd",
                                    }}>
                                    {formatMinutes(earlyMinutes)}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>

                          <td className="text-center">
                            <div
                              style={{
                                display: "inline-flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "6px",
                                flexWrap: "nowrap",
                                whiteSpace: "nowrap",
                              }}>
                              {(() => {
                                const lateMinutes =
                                  Number(log.late_minutes) || 0;
                                if (!lateMinutes) return <span>-</span>;

                                return (
                                  <span
                                    style={{
                                      padding: "6px 8px",
                                      borderRadius: 999,
                                      background: "#fee2e2",
                                      color: "#dc2626ee",
                                      fontWeight: 700,
                                      border: "1px solid #fca5a5",
                                    }}>
                                    {formatMinutes(lateMinutes)}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>

                          <td className="text-center">
                            <div
                              style={{
                                display: "inline-flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "6px",
                                flexWrap: "nowrap",
                                whiteSpace: "nowrap",
                              }}>
                              {(() => {
                                const earlyArrival =
                                  Number(
                                    log.early_minutes ??
                                      log.early_arrival_minutes,
                                  ) || 0;
                                const totalMinutes = Math.max(
                                  0,
                                  Number(log.work_minutes || 0) + earlyArrival,
                                );

                                return totalMinutes > 0 ? (
                                  <span
                                    style={{
                                      padding: "6px 8px",
                                      borderRadius: 999,
                                      background: "#10b9811f",
                                      color: "#047857",
                                      fontWeight: 700,
                                      border: "1px solid #10b98140",
                                    }}>
                                    {formatMinutes(totalMinutes)}
                                  </span>
                                ) : (
                                  <span>-</span>
                                );
                              })()}
                            </div>
                          </td>

                          <td className="text-center">
                            <div
                              style={{
                                display: "inline-flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "6px",
                                flexWrap: "nowrap",
                                whiteSpace: "nowrap",
                              }}>
                              {(() => {
                                const overtimeMinutes =
                                  Number(log.overtime_minutes) || 0;
                                if (!overtimeMinutes) return <span>-</span>;

                                return (
                                  <span
                                    style={{
                                      padding: "6px 8px",
                                      borderRadius: 999,
                                      background: "#fef3c7",
                                      color: "#b45309",
                                      fontWeight: 700,
                                      border: "1px solid #fcd34d",
                                    }}>
                                    {formatMinutes(overtimeMinutes)}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="text-center">
                            {(() => {
                              const checkoutInfo = getCheckOutType(log.status);
                              return (
                                <span
                                  style={{
                                    padding: "6px 8px",
                                    borderRadius: 999,
                                    background: checkoutInfo.bg,
                                    color: checkoutInfo.color,
                                    fontWeight: 700,
                                    border: `1px solid ${checkoutInfo.borderColor || checkoutInfo.color}`,
                                    fontSize: "12px",
                                  }}
                                  title={checkoutInfo.label}>
                                  {checkoutInfo.type}
                                </span>
                              );
                            })()}
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
