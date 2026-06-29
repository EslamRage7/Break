import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  CircularProgress,
  MenuItem,
  Snackbar,
  TextField,
} from "@mui/material";
import Sidebar from "../components/Sidebar";
import { supabase } from "../supabaseClient";
import Footer from "../components/Footer";

const departmentNames = {
  CS: "Call Center",
  GD: "Graphic Design",
  DE: "Data Entry",
  DV: "Development",
};

const formatDateTime = (value) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState("");
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

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <h1>Employees Table</h1>
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
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    {/* <th>Used</th> */}
                    <th>Last Break</th>
                    <th>Role</th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map((employee, index) => {
                    const employeeBreaks = breaksByUser[employee.user_id] || [];
                    const totalUsed = employeeBreaks.reduce(
                      (sum, item) => sum + calculateUsedMinutes(item),
                      0,
                    );
                    const lastBreak = [...employeeBreaks].sort(
                      (a, b) =>
                        new Date(b.start_time || 0) -
                        new Date(a.start_time || 0),
                    )[0];
                    const lastBreakLabel = lastBreak
                      ? `${formatDateTime(lastBreak.start_time)} • ${calculateUsedMinutes(lastBreak)} min`
                      : "-";

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
                        <td>{employee.email}</td>
                        <td>
                          {departmentNames[employee.department] ||
                            employee.department ||
                            "-"}
                        </td>
                        {/* <td>
                          <span className="table-pill">
                            {totalUsed > 0 ? `${totalUsed} min` : "-"}
                          </span>
                        </td> */}
                        <td>
                          <span className="table-pill table-pill-neutral">
                            {lastBreakLabel}
                          </span>
                        </td>
                        <td>
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
