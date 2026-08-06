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
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import Typography from "@mui/material/Typography";

const formatDateTime = (value) => {
  if (!value) return "-";

  const text = String(value).trim();

  if (!text) return "-";

  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) {
    return text;
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

const formatMinutesDuration = (minutes) => {
  if (!minutes && minutes !== 0) return "-";

  const value = Number(minutes);
  if (!Number.isFinite(value)) return "-";

  const hours = Math.floor(value / 60);
  const mins = value % 60;

  if (hours && mins) {
    return `${hours}h ${mins}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${mins}m`;
};

const departmentNames = {
  CS: "Call Center",
  GD: "Graphic Design",
  DE: "Data Entry",
  DV: "Development",
  PK: "Packaging",
  MG: "Management",
};

const getDepartmentCode = (value) => {
  const text = `${value || ""}`.trim();
  if (!text) return "";

  // direct key match (case-insensitive)
  const keyMatch = Object.keys(departmentNames).find(
    (k) => k.toLowerCase() === text.toLowerCase(),
  );
  if (keyMatch) return keyMatch;

  // label match (case-insensitive)
  const labelMatch = Object.entries(departmentNames).find(
    ([, label]) => `${label || ""}`.trim().toLowerCase() === text.toLowerCase(),
  );
  if (labelMatch) return labelMatch[0];

  // compact normalized match
  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const compactMatch = Object.entries(departmentNames).find(([, label]) => {
    const normLabel = `${label || ""}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    return normLabel === compact || label?.toLowerCase() === compact;
  });
  if (compactMatch) return compactMatch[0];

  // fallback to original value for custom departments
  return text;
};

const getDepartmentLabel = (value) => {
  const text = `${value || ""}`.trim();
  if (!text) return "-";

  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]+/g, "");

  const directMatch = Object.entries(departmentNames).find(([key]) => {
    return key.toLowerCase() === normalizedText;
  });
  if (directMatch) return directMatch[1];

  const labelMatch = Object.entries(departmentNames).find(([, label]) => {
    const normalizedLabel = `${label || ""}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    return normalizedLabel === normalizedText;
  });
  return labelMatch ? labelMatch[1] : text;
};

export default function AttendanceTable() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [canManageAttendance, setCanManageAttendance] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [monthQuery, setMonthQuery] = useState("");

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  useEffect(() => {
    const load = async () => {
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
        console.log("Current Employee", currentEmployee);
        if (currentEmployeeError) throw currentEmployeeError;

        setUserRole(currentEmployee?.role || "");

        const canManage =
          currentEmployee?.role === "admin" ||
          currentEmployee?.role === "team_leader";

        setCanManageAttendance(canManage);
        if (!canManage) {
          setNameQuery("");
          setDepartmentQuery("");
          setDateQuery("");
        }

        const { data: employeeRows, error: employeeError } = await supabase
          .from("employees")
          .select("user_id,email,first_name,last_name,department,role,team_id")
          .order("first_name", { ascending: true });

        if (employeeError) throw employeeError;

        let visibleEmployees = employeeRows || [];
        if (currentEmployee?.role === "team_leader") {
          const teamMemberIds = [
            ...new Set([
              ...visibleEmployees
                .filter((emp) => emp.team_id === currentEmployee.team_id)
                .map((emp) => emp.user_id),
              user.id,
            ]),
          ];

          visibleEmployees = visibleEmployees.filter((emp) =>
            teamMemberIds.includes(emp.user_id),
          );
        }

        setEmployees(visibleEmployees);

        let logsData = [];

        if (canManage) {
          let attendanceQuery = supabase
            .from("attendance")
            .select(
              `
      id,
      user_id,
      attendance_date,
      shift_name,
      shift_start,
      shift_end,
      early_arrival_minutes,
      check_in,
      check_out,
      work_minutes,
      late_minutes,
      overtime_minutes,
      status,
      created_at
    `,
              { count: "exact" },
            )
            .order("attendance_date", { ascending: false })
            .order("created_at", { ascending: false });

          if (currentEmployee?.role === "team_leader") {
            const teamMemberIds = visibleEmployees.map((emp) => emp.user_id);
            attendanceQuery = attendanceQuery.in("user_id", teamMemberIds);
          }
          const { data, error } = await attendanceQuery;

          if (error) throw error;

          const attendanceMap = new Map();
          (data || []).forEach((item) => {
            if (!attendanceMap.has(item.user_id)) {
              attendanceMap.set(item.user_id, item);
            }
          });

          logsData = visibleEmployees.map(
            (employee) =>
              attendanceMap.get(employee.user_id) || {
                id: employee.user_id,
                user_id: employee.user_id,
                attendance_date: null,
                shift_name: "-",
                check_in: null,
                check_out: null,
                status: "-",
              },
          );

          setLogs(logsData);
        } else {
          const { data, error } = await supabase
            .from("attendance")
            .select(
              `
      id,
      user_id,
      attendance_date,
      shift_name,
      shift_start,
      shift_end,
      early_arrival_minutes,
      check_in,
      check_out,
      work_minutes,
      late_minutes,
      overtime_minutes,
      status,
      created_at
    `,
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (error) throw error;

          logsData = data || [];
        }

        setLogs(logsData || []);
      } catch (err) {
        console.error(err);
        setSnackbar({
          open: true,
          message: err.message || "Failed to load attendance logs",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const employeeName = (id) => {
    const e = employees.find((x) => x.user_id === id);
    if (!e) return id;
    return `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.email || id;
  };

  const employeeLookup = useMemo(() => {
    return (employees || []).reduce((acc, employee) => {
      acc[employee.user_id] = employee;
      return acc;
    }, {});
  }, [employees]);

  const filteredLogs = useMemo(() => {
    const baseLogs = logs || [];

    if (!canManageAttendance) {
      return baseLogs.filter((log) => {
        if (dateQuery) {
          const logDate = new Date(log.attendance_date)
            .toISOString()
            .split("T")[0];
          if (logDate !== dateQuery) {
            return false;
          }
        }

        if (monthQuery) {
          const logMonth = new Date(log.attendance_date);
          if (Number.isNaN(logMonth.getTime())) return false;
          const selectedMonth = monthQuery.split("-");
          const year = Number(selectedMonth[0]);
          const month = Number(selectedMonth[1]) - 1;
          if (
            logMonth.getFullYear() !== year ||
            logMonth.getMonth() !== month
          ) {
            return false;
          }
        }

        return true;
      });
    }

    const seenUsers = new Set();

    return baseLogs.filter((log) => {
      if (seenUsers.has(log.user_id)) {
        return false;
      }

      const employee = employeeLookup[log.user_id];

      if (nameQuery && employee?.user_id !== nameQuery) {
        return false;
      }

      if (
        departmentQuery &&
        getDepartmentCode(employee?.department) !== departmentQuery
      ) {
        return false;
      }

      if (dateQuery) {
        const logDate = new Date(log.attendance_date)
          .toISOString()
          .split("T")[0];
        if (logDate !== dateQuery) {
          return false;
        }
      }

      if (monthQuery) {
        const logMonth = new Date(log.attendance_date);
        if (Number.isNaN(logMonth.getTime())) return false;
        const selectedMonth = monthQuery.split("-");
        const year = Number(selectedMonth[0]);
        const month = Number(selectedMonth[1]) - 1;
        if (logMonth.getFullYear() !== year || logMonth.getMonth() !== month) {
          return false;
        }
      }

      seenUsers.add(log.user_id);
      return true;
    });
  }, [
    logs,
    employeeLookup,
    nameQuery,
    departmentQuery,
    dateQuery,
    monthQuery,
    canManageAttendance,
  ]);

  const employeeOptions = useMemo(() => {
    return (employees || [])
      .map((employee) => ({
        value: employee.user_id,
        label:
          `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
          employee.email ||
          employee.user_id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees]);

  const departmentOptions = useMemo(() => {
    const map = new Map();
    (employees || []).forEach((employee) => {
      const code = getDepartmentCode(employee?.department);
      if (!code) return;
      if (!map.has(code)) {
        const label = departmentNames[code] || employee.department || code;
        map.set(code, label);
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees]);

  const availableDates = useMemo(() => {
    const set = new Set();
    (logs || []).forEach((log) => {
      if (log.attendance_date) {
        const dateStr = new Date(log.attendance_date)
          .toISOString()
          .split("T")[0];
        set.add(dateStr);
      }
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [logs]);

  const availableMonths = useMemo(() => {
    const set = new Set();
    (logs || []).forEach((log) => {
      if (log.attendance_date) {
        const date = new Date(log.attendance_date);
        if (!Number.isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = `${date.getMonth() + 1}`.padStart(2, "0");
          set.add(`${year}-${month}`);
        }
      }
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [logs]);

  const handleClearFilters = () => {
    setNameQuery("");
    setDepartmentQuery("");
    setDateQuery("");
    setMonthQuery("");
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a" }}>
              {userRole === "admin"
                ? "Attendance Logs"
                : userRole === "team_leader"
                  ? "Team Attendance"
                  : "My Attendance"}
            </Typography>

            <Typography variant="body2" sx={{ mt: 0.5, color: "#64748b" }}>
              {canManageAttendance
                ? "View and monitor attendance records."
                : "View your attendance history and daily check-in records."}
            </Typography>
          </div>

          {loading && (
            <div className="admin-loading text-center justify-content-center mb-3">
              <CircularProgress size={30} />
              <span>Loading attendance...</span>
            </div>
          )}

          {!loading && (
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 16,
                }}>
                {canManageAttendance && (
                  <>
                    <FormControl size="small" style={{ minWidth: 220 }}>
                      <InputLabel id="employee-filter-label">
                        Employee
                      </InputLabel>
                      <Select
                        labelId="employee-filter-label"
                        label="Employee"
                        value={nameQuery}
                        onChange={(event) => setNameQuery(event.target.value)}>
                        <MenuItem value="">All</MenuItem>
                        {employeeOptions.map((employee) => (
                          <MenuItem value={employee.value} key={employee.value}>
                            {employee.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" style={{ minWidth: 180 }}>
                      <InputLabel id="department-filter-label">
                        Department
                      </InputLabel>
                      <Select
                        labelId="department-filter-label"
                        label="Department"
                        value={departmentQuery}
                        onChange={(event) =>
                          setDepartmentQuery(event.target.value)
                        }>
                        <MenuItem value="">All</MenuItem>
                        {departmentOptions.map((department) => (
                          <MenuItem
                            value={department.value}
                            key={department.value}>
                            {department.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}

                <FormControl size="small" style={{ minWidth: 180 }}>
                  <InputLabel id="date-filter-label">Date</InputLabel>
                  <Select
                    labelId="date-filter-label"
                    label="Date"
                    value={dateQuery}
                    onChange={(event) => setDateQuery(event.target.value)}>
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

                <FormControl size="small" style={{ minWidth: 180 }}>
                  <InputLabel id="month-filter-label">Month</InputLabel>
                  <Select
                    labelId="month-filter-label"
                    label="Month"
                    value={monthQuery}
                    onChange={(event) => setMonthQuery(event.target.value)}>
                    <MenuItem value="">All months</MenuItem>
                    {availableMonths.map((month) => (
                      <MenuItem value={month} key={month}>
                        {new Intl.DateTimeFormat("en", {
                          month: "long",
                          year: "numeric",
                          timeZone: "Africa/Cairo",
                        }).format(new Date(`${month}-01`))}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleClearFilters}
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
                      {canManageAttendance && <th>Name</th>}
                      {canManageAttendance && (
                        <th className="text-center">Department</th>
                      )}
                      <th className="text-center">Shift</th>

                      <th className="text-center">Check In</th>
                      <th className="text-center">Check Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={canManageAttendance ? 6 : 4}>
                          {canManageAttendance
                            ? "No attendance logs found."
                            : "No attendance logs found for your account."}
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((l, i) => (
                        <tr key={l.id}>
                          <td>
                            <strong>{i + 1}</strong>
                          </td>

                          {canManageAttendance && (
                            <td className="text-capitalize name-link-cell">
                              <span
                                onClick={() =>
                                  canManageAttendance &&
                                  navigate(`/employee-attendance/${l.user_id}`)
                                }
                                style={{
                                  cursor: canManageAttendance
                                    ? "pointer"
                                    : "default",
                                  color: canManageAttendance
                                    ? "#0ea5e9"
                                    : "inherit",
                                  fontWeight: 600,
                                }}>
                                {employeeName(l.user_id)}
                              </span>
                            </td>
                          )}

                          {canManageAttendance && (
                            <td className="text-center">
                              {getDepartmentLabel(
                                employeeLookup[l.user_id]?.department,
                              )}
                            </td>
                          )}

                          <td className="text-center">{l.shift_name || "-"}</td>

                          <td className="text-center">
                            {formatDateTime(l.check_in)}
                          </td>

                          <td className="text-center">
                            {formatDateTime(l.check_out)}
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
