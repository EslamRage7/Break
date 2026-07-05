import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Snackbar,
  TextField,
} from "@mui/material";
import Sidebar from "../components/Sidebar";
import { supabase } from "../supabaseClient";
import Typography from "@mui/material/Typography";
import Footer from "../components/Footer";

const departmentNames = {
  CS: "Call Center",
  GD: "Graphic Design",
  DE: "Data Entry",
  DV: "Development",
};

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
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(parsedDate);
  }

  return text;
};

const calculateUsedMinutes = (item) => {
  if (!item) return 0;

  if (item.status === "completed") {
    return item.used_minutes || 0;
  }

  if (item.is_paused) {
    return item.used_minutes || 0;
  }

  const elapsed = Math.floor(
    (Date.now() - new Date(item.start_time).getTime()) / 1000,
  );

  const currentUsedSeconds = Math.min(elapsed, item.duration_seconds || 2700);

  return Math.floor(currentUsedSeconds / 60);
};

export default function AdminTable() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [employeeShifts, setEmployeeShifts] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [filters, setFilters] = useState({
    name: "all",
    department: "all",
    shift: "all",
    role: "all",
  });
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

  const breaksByUser = useMemo(() => {
    return breaks.reduce((acc, item) => {
      if (!acc[item.user_id]) acc[item.user_id] = [];
      acc[item.user_id].push(item);
      return acc;
    }, {});
  }, [breaks]);

  const nameOptions = useMemo(() => {
    const uniqueNames = new Map();

    employees.forEach((employee) => {
      const fullName =
        `${employee.first_name || ""} ${employee.last_name || ""}`.trim();
      if (fullName && !uniqueNames.has(fullName)) {
        uniqueNames.set(fullName, fullName);
      }
    });

    return Array.from(uniqueNames.values()).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const departmentOptions = useMemo(() => {
    return Object.entries(departmentNames).map(([value, label]) => ({
      value,
      label,
    }));
  }, []);

  const normalizeDepartmentValue = (value) => {
    const text = `${value || ""}`.trim().toLowerCase();

    if (!text) return "";

    const compact = text.replace(/[^a-z0-9]+/g, "");

    const departmentCode = Object.keys(departmentNames).find((key) => {
      return key.toLowerCase() === text || key.toLowerCase() === compact;
    });

    if (departmentCode) {
      return departmentCode.toLowerCase();
    }

    const labelMatch = Object.entries(departmentNames).find(([, label]) => {
      const normalizedLabel = `${label}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      return normalizedLabel === compact;
    });

    return labelMatch ? labelMatch[0].toLowerCase() : compact;
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const fullName =
        `${employee.first_name || ""} ${employee.last_name || ""}`
          .trim()
          .toLowerCase();
      const selectedRole = employee.role || "employee";
      const selectedShift = employeeShifts[employee.user_id] || "";
      const employeeDepartmentValue = normalizeDepartmentValue(
        employee.department,
      );
      const filterDepartmentValue = normalizeDepartmentValue(
        filters.department,
      );
      const normalizedFilter = (value) => `${value || ""}`.trim().toLowerCase();

      const matchesName =
        filters.name === "all" || fullName === normalizedFilter(filters.name);
      const matchesDepartment =
        filters.department === "all" ||
        employeeDepartmentValue === filterDepartmentValue;
      const matchesShift =
        filters.shift === "all" || selectedShift === filters.shift;
      const matchesRole =
        filters.role === "all" || selectedRole === filters.role;

      return matchesName && matchesDepartment && matchesShift && matchesRole;
    });
  }, [employees, employeeShifts, filters]);

  useEffect(() => {
    const loadAdminData = async () => {
      setLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user?.id) throw new Error("Please login again");

        setCurrentUserId(user.id);

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
        setBreaks(breakRows);

        const { data: shiftRows, error: shiftError } = await supabase
          .from("shifts")
          .select("*")
          .order("start_time");
        console.log("shiftRows", shiftRows);
        console.log("shiftError", shiftError);
        if (shiftError) throw shiftError;

        setShifts(shiftRows || []);
        console.log("shiftRows", shiftRows);

        const { data: employeeShiftRows, error: employeeShiftError } =
          await supabase.from("employee_shifts").select("user_id, shift_id");

        if (employeeShiftError) throw employeeShiftError;

        const map = {};

        employeeShiftRows.forEach((item) => {
          map[item.user_id] = item.shift_id;
        });

        setEmployeeShifts(map);
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Failed to load admin table", "error");
      } finally {
        setLoading(false);
      }
    };

    loadAdminData();
  }, []);

  const handleRoleChange = async (employee, role) => {
    if (employee.user_id === currentUserId && role !== "admin") {
      showMessage("You cannot remove your own admin access", "warning");
      return;
    }

    setUpdatingUserId(employee.user_id);

    try {
      const { error } = await supabase
        .from("employees")
        .update({ role })
        .eq("user_id", employee.user_id);

      if (error) throw error;

      setEmployees((prev) =>
        prev.map((item) =>
          item.user_id === employee.user_id ? { ...item, role } : item,
        ),
      );

      showMessage("Role updated successfully", "success");
    } catch (err) {
      console.error(err);
      showMessage(err.message || "Failed to update role", "error");
    } finally {
      setUpdatingUserId("");
    }
  };
  const saveShift = async (userId, shiftId) => {
    try {
      const { error } = await supabase.from("employee_shifts").upsert(
        {
          user_id: userId,
          shift_id: shiftId,
          from_date: new Date().toISOString().split("T")[0],
        },
        {
          onConflict: "user_id",
        },
      );

      if (error) throw error;

      setEmployeeShifts((prev) => ({
        ...prev,
        [userId]: shiftId,
      }));

      showMessage("Shift updated successfully", "success");
    } catch (err) {
      console.error(err);

      showMessage(err.message, "error");
    }
  };
  const handleClearFilters = () => {
    setFilters({
      name: "all",
      department: "all",
      shift: "all",
      role: "all",
    });
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a" }}>
              Employees Table
            </Typography>
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

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
              alignItems: "end",
            }}>
            <TextField
              select
              size="small"
              label="Name"
              value={filters.name}
              sx={{ minWidth: 180 }}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }>
              <MenuItem value="all">All</MenuItem>
              {nameOptions.map((name) => (
                <MenuItem key={name} value={name.toLowerCase()}>
                  {name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Department"
              value={filters.department}
              sx={{ minWidth: 180 }}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  department: event.target.value,
                }))
              }>
              <MenuItem value="all">All</MenuItem>
              {departmentOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Shift"
              value={filters.shift}
              sx={{ minWidth: 180 }}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  shift: event.target.value,
                }))
              }>
              <MenuItem value="all">All</MenuItem>
              {shifts.map((shift) => (
                <MenuItem key={shift.id} value={shift.id}>
                  {shift.shift_name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Role"
              value={filters.role}
              sx={{ minWidth: 180 }}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  role: event.target.value,
                }))
              }>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="employee">Employee</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>

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

          {!loading && isAdmin && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th className="text-center">Email</th>
                    <th className="text-center">Department</th>
                    <th className="text-center">Shift</th>
                    <th className="text-center">Role</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredEmployees.map((employee, index) => {
                    const employeeBreaks = breaksByUser[employee.user_id] || [];

                    return (
                      <tr key={employee.user_id}>
                        <td>
                          <strong>{index + 1}</strong>
                        </td>
                        <td>
                          <strong>
                            {employee.first_name} {employee.last_name}
                          </strong>
                        </td>
                        <td className="text-center">{employee.email}</td>
                        <td className="text-center">
                          {departmentNames[employee.department] ||
                            employee.department ||
                            "-"}
                        </td>

                        <td className="text-center">
                          <TextField
                            size="small"
                            select
                            value={employeeShifts[employee.user_id] || ""}
                            sx={{ minWidth: 180 }}
                            onChange={(e) =>
                              saveShift(employee.user_id, e.target.value)
                            }>
                            <MenuItem value="">Select Shift</MenuItem>

                            {shifts.map((shift) => (
                              <MenuItem key={shift.id} value={shift.id}>
                                {shift.shift_name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </td>
                        <td className="text-center">
                          <TextField
                            size="small"
                            select
                            value={employee.role || "employee"}
                            disabled={updatingUserId === employee.user_id}
                            onChange={(event) =>
                              handleRoleChange(employee, event.target.value)
                            }>
                            <MenuItem value="employee">Employee</MenuItem>
                            <MenuItem value="admin">Admin</MenuItem>
                          </TextField>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredEmployees.length === 0 && (
                <div
                  style={{ padding: 16, textAlign: "center", color: "#666" }}>
                  No employees match the selected filters.
                </div>
              )}
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
