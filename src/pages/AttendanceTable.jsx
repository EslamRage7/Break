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

export default function AttendanceTable() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [canManageAttendance, setCanManageAttendance] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [roleQuery, setRoleQuery] = useState("");

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

        if (currentEmployeeError) throw currentEmployeeError;

        setUserRole(currentEmployee?.role || "");

        const canManage =
          currentEmployee?.role === "admin" ||
          currentEmployee?.role === "team_leader";

        setCanManageAttendance(canManage);
        if (!canManage) {
          setNameQuery("");
          setDepartmentQuery("");
          setRoleQuery("");
        }

        const { data: employeeRows, error: employeeError } = await supabase
          .from("employees")
          .select("user_id,email,first_name,last_name,department,role,team_id")
          .order("first_name", { ascending: true });

        if (employeeError) throw employeeError;

        // Filter employees based on role
        let filteredEmployees = employeeRows || [];
        if (currentEmployee?.role === "team_leader") {
          filteredEmployees = filteredEmployees.filter(
            (emp) => emp.team_id === currentEmployee.team_id,
          );
        }

        setEmployees(filteredEmployees);

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
            )
            .order("created_at", { ascending: false });

          // For team leaders, filter by their team members
          if (currentEmployee?.role === "team_leader") {
            const teamMemberIds = filteredEmployees.map((emp) => emp.user_id);
            attendanceQuery = attendanceQuery.in("user_id", teamMemberIds);
          }

          const { data, error } = await attendanceQuery;

          if (error) throw error;

          logsData = data;
          setLogs(logsData || []);
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

          logsData = data;
        }

        setLogs(logsData || []);
        console.log(logsData);
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
    return (logs || []).filter((log) => {
      const employee = employeeLookup[log.user_id];

      if (nameQuery && employee?.user_id !== nameQuery) {
        return false;
      }

      if (departmentQuery && employee?.department !== departmentQuery) {
        return false;
      }

      if (roleQuery && employee?.role !== roleQuery) {
        return false;
      }

      return true;
    });
  }, [logs, employeeLookup, nameQuery, departmentQuery, roleQuery]);

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

  const departments = useMemo(() => {
    return Array.from(
      new Set(
        (employees || [])
          .map((employee) => employee.department)
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const roles = useMemo(() => {
    return Array.from(
      new Set(
        (employees || []).map((employee) => employee.role).filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const handleClearFilters = () => {
    setNameQuery("");
    setDepartmentQuery("");
    setRoleQuery("");
  };

  console.log(filteredLogs);

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
            <div className="admin-loading">
              <CircularProgress size={30} />
              <span>Loading attendance...</span>
            </div>
          )}

          {!loading && (
            <div>
              {canManageAttendance && (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 16,
                  }}>
                  <FormControl size="small" style={{ minWidth: 220 }}>
                    <InputLabel id="employee-filter-label">Employee</InputLabel>
                    <Select
                      labelId="employee-filter-label"
                      label="Employee"
                      value={nameQuery}
                      onChange={(event) => setNameQuery(event.target.value)}>
                      <MenuItem value="">All employees</MenuItem>
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
                      <MenuItem value="">All departments</MenuItem>
                      {departments.map((department) => (
                        <MenuItem value={department} key={department}>
                          {department}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" style={{ minWidth: 180 }}>
                    <InputLabel id="role-filter-label">Role</InputLabel>
                    <Select
                      labelId="role-filter-label"
                      label="Role"
                      value={roleQuery}
                      onChange={(event) => setRoleQuery(event.target.value)}>
                      <MenuItem value="">All roles</MenuItem>
                      {roles.map((role) => (
                        <MenuItem value={role} key={role}>
                          {role}
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
              )}

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th className="text-center">Shift</th>
                      <th className="text-center">Check In</th>
                      <th className="text-center">Check Out</th>

                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={12}>
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

                          <td>
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

                          <td className="text-center">{l.shift_name || "-"}</td>

                          <td className="text-center">
                            {formatDateTime(l.check_in)}
                          </td>

                          <td className="text-center">
                            {formatDateTime(l.check_out)}
                          </td>

                          <td className="text-center">
                            <span
                              className={`table-pill ${
                                !l.check_in
                                  ? "table-pill-danger"
                                  : l.check_in && !l.check_out
                                    ? "table-pill-success"
                                    : "table-pill-neutral"
                              }`}>
                              {!l.check_in
                                ? "Absent"
                                : l.check_in && !l.check_out
                                  ? "Working"
                                  : "Finished"}
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
