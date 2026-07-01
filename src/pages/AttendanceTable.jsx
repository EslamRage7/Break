import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  const [isAdmin, setIsAdmin] = useState(false);
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
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (currentEmployeeError) throw currentEmployeeError;

        const adminView = currentEmployee?.role === "admin";
        setIsAdmin(adminView);

        if (!adminView) {
          setNameQuery("");
          setDepartmentQuery("");
          setRoleQuery("");
        }

        const { data: employeeRows, error: employeeError } = await supabase
          .from("employees")
          .select("user_id,email,first_name,last_name,department,role")
          .order("first_name", { ascending: true });

        if (employeeError) throw employeeError;
        setEmployees(employeeRows || []);

        let logsData = [];

        if (adminView) {
          const { data, error } = await supabase.rpc("get_latest_attendance");

          if (error) throw error;

          logsData = data;
          if (logsData?.length) {
            console.log("First Row:", logsData[0]);
            console.log("check_in:", logsData[0].check_in);
            console.log("check_out:", logsData[0].check_out);
            console.log("shift_start:", logsData[0].shift_start);
            console.log("shift_end:", logsData[0].shift_end);
          }

          setLogs(logsData || []);

          console.log("logsData:", logsData);
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
      check_in,
      check_out,
      work_minutes,
      late_minutes,
      early_minutes,
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

  console.log(filteredLogs);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <h1>{isAdmin ? "Attendance Logs" : "My Attendance"}</h1>
          </div>

          {loading && (
            <div className="admin-loading">
              <CircularProgress size={30} />
              <span>Loading attendance...</span>
            </div>
          )}

          {!loading && (
            <div>
              {isAdmin && (
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
                </div>
              )}

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Employee</th>
                      <th>Shift</th>
                      <th>Shift Start</th>
                      <th>Shift End</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Late</th>
                      <th>Early Leave</th>
                      <th>Overtime</th>
                      <th>Work Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={12}>
                          {isAdmin
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
                                isAdmin &&
                                navigate(`/employee-attendance/${l.user_id}`)
                              }
                              style={{
                                cursor: isAdmin ? "pointer" : "default",
                                color: isAdmin ? "#0ea5e9" : "inherit",
                                fontWeight: 600,
                              }}>
                              {employeeName(l.user_id)}
                            </span>
                          </td>

                          <td>{l.shift_name || "-"}</td>

                          <td>{formatDateTime(l.shift_start)}</td>

                          <td>{formatDateTime(l.shift_end)}</td>

                          <td>{formatDateTime(l.check_in)}</td>

                          <td>{formatDateTime(l.check_out)}</td>

                          <td>{formatMinutesDuration(l.late_minutes)}</td>

                          <td>{formatMinutesDuration(l.early_minutes)}</td>

                          <td>{formatMinutesDuration(l.overtime_minutes)}</td>

                          <td>{formatMinutesDuration(l.work_minutes)}</td>

                          <td>
                            <span
                              className={`table-pill ${
                                l.status === "Working"
                                  ? "table-pill-success"
                                  : l.status === "Completed"
                                    ? "table-pill-info"
                                    : l.status.includes("Late")
                                      ? "table-pill-warning"
                                      : l.status.includes("Early")
                                        ? "table-pill-danger"
                                        : l.status.includes("Overtime")
                                          ? "table-pill-primary"
                                          : l.status === "Absent"
                                            ? "table-pill-danger"
                                            : "table-pill-neutral"
                              }`}>
                              {l.status}
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
