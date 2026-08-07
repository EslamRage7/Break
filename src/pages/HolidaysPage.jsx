import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
import Typography from "@mui/material/Typography";

const emptyForm = {
  user_id: "",
  holiday_name: "",
  holiday_date: "",
  notes: "",
};

const employeeLabel = (employee) =>
  `${employee?.first_name || ""} ${employee?.last_name || ""}`.trim() ||
  employee?.email ||
  employee?.user_id;

const formatDate = (date) => {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "Africa/Cairo",
  }).format(new Date(`${date}T00:00:00`));
};

export default function HolidaysPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    holiday: null,
  });
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const canManage = role === "admin" || role === "team_leader";
  const isEmployeeDetail = canManage && Boolean(userId);
  const showMessage = (message, severity = "info") =>
    setSnackbar({ open: true, message, severity });

  const employeeNames = useMemo(
    () =>
      employees.reduce(
        (names, employee) => ({
          ...names,
          [employee.user_id]: employeeLabel(employee),
        }),
        {},
      ),
    [employees],
  );

  const departmentOptions = useMemo(() => {
    const departments = new Map();

    employees.forEach((employee) => {
      const department = `${employee.department || ""}`.trim();
      if (department) departments.set(department.toLowerCase(), department);
    });

    return Array.from(departments.values()).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const loadData = useCallback(async () => {
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

      const currentRole = currentEmployee?.role || "";
      setRole(currentRole);

      let employeeRows = [];
      if (currentRole === "admin" || currentRole === "team_leader") {
        const { data: adminData, error: adminError } =
          await supabase.functions.invoke("admin-data");
        if (adminError) throw adminError;

        employeeRows = adminData?.employees || [];
        if (currentRole === "team_leader") {
          employeeRows = employeeRows.filter(
            (employee) => employee.team_id === currentEmployee?.team_id,
          );
        }
      } else {
        employeeRows = [{ ...currentEmployee, user_id: user.id }];
      }
      setEmployees(employeeRows);

      let holidaysQuery = supabase
        .from("employee_holidays")
        .select("id, user_id, holiday_name, holiday_date, notes, created_at")
        .order("holiday_date", { ascending: false });
      if (currentRole !== "admin" && currentRole !== "team_leader") {
        holidaysQuery = holidaysQuery.eq("user_id", user.id);
      }

      const { data: holidayRows, error: holidaysError } = await holidaysQuery;
      if (holidaysError) throw holidaysError;

      const permittedIds = new Set(
        employeeRows.map((employee) => employee.user_id),
      );
      setHolidays(
        (holidayRows || []).filter((holiday) =>
          permittedIds.has(holiday.user_id),
        ),
      );
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to load holidays", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const visibleHolidays = useMemo(() => {
    const employeeById = new Map(
      employees.map((employee) => [employee.user_id, employee]),
    );
    const normalizedNameFilter = nameFilter.trim().toLowerCase();

    return holidays.filter((holiday) => {
      if (userId && holiday.user_id !== userId) return false;

      const department =
        `${employeeById.get(holiday.user_id)?.department || ""}`.trim();
      const matchesDepartment =
        !selectedDepartment ||
        department.toLowerCase() === selectedDepartment.toLowerCase();
      const matchesName =
        !normalizedNameFilter ||
        `${holiday.holiday_name || ""} ${holiday.notes || ""}`
          .toLowerCase()
          .includes(normalizedNameFilter);

      return matchesDepartment && matchesName;
    });
  }, [employees, holidays, nameFilter, selectedDepartment, userId]);

  const holidaySummary = useMemo(() => {
    const countByUser = holidays.reduce((counts, holiday) => {
      counts[holiday.user_id] = (counts[holiday.user_id] || 0) + 1;
      return counts;
    }, {});
    const normalizedNameFilter = nameFilter.trim().toLowerCase();

    return employees
      .filter((employee) => {
        const department = `${employee.department || ""}`.trim();
        const matchesDepartment =
          !selectedDepartment ||
          department.toLowerCase() === selectedDepartment.toLowerCase();
        const employeeName = employeeLabel(employee).toLowerCase();
        const matchesName =
          !normalizedNameFilter ||
          employeeName.includes(normalizedNameFilter) ||
          `${employee.email || ""}`
            .toLowerCase()
            .includes(normalizedNameFilter);

        return matchesDepartment && matchesName;
      })
      .map((employee) => ({
        ...employee,
        holidayCount: countByUser[employee.user_id] || 0,
      }));
  }, [employees, holidays, nameFilter, selectedDepartment]);

  const detailEmployee = useMemo(
    () => employees.find((employee) => employee.user_id === userId) || null,
    [employees, userId],
  );

  const openAddDialog = () => {
    setEditingHoliday(null);
    setForm({ ...emptyForm, user_id: userId || "" });
    setDialogOpen(true);
  };

  const openEditDialog = (holiday) => {
    setEditingHoliday(holiday);
    setForm({
      user_id: holiday.user_id,
      holiday_name: holiday.holiday_name || "",
      holiday_date: holiday.holiday_date || "",
      notes: holiday.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setDialogOpen(false);
  };

  const openDeleteDialog = (holiday) => {
    setDeleteDialog({ open: true, holiday });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ open: false, holiday: null });
  };

  const saveHoliday = async (event) => {
    event.preventDefault();
    if (!form.user_id || !form.holiday_name.trim() || !form.holiday_date) {
      showMessage("Employee, holiday name, and date are required.", "warning");
      return;
    }
    if (!employees.some((employee) => employee.user_id === form.user_id)) {
      showMessage(
        "You do not have permission to manage this employee.",
        "error",
      );
      return;
    }

    setSaving(true);
    const payload = {
      user_id: form.user_id,
      holiday_name: form.holiday_name.trim(),
      holiday_date: form.holiday_date,
      notes: form.notes.trim() || null,
    };
    try {
      const query = editingHoliday
        ? supabase
            .from("employee_holidays")
            .update(payload)
            .eq("id", editingHoliday.id)
        : supabase.from("employee_holidays").insert(payload);
      const { error } = await query;
      if (error) throw error;
      showMessage(
        editingHoliday
          ? "Holiday updated successfully."
          : "Holiday added successfully.",
        "success",
      );
      setDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to save holiday", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteHoliday = async () => {
    const holiday = deleteDialog.holiday;
    if (!holiday) return;

    try {
      const { error } = await supabase
        .from("employee_holidays")
        .delete()
        .eq("id", holiday.id);
      if (error) throw error;
      setHolidays((current) =>
        current.filter((item) => item.id !== holiday.id),
      );
      showMessage("Holiday deleted successfully.", "success");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to delete holiday", "error");
    } finally {
      closeDeleteDialog();
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a" }}>
              {isEmployeeDetail
                ? "Holiday History"
                : canManage
                  ? "Holiday Management"
                  : "My Holidays"}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: "#64748b" }}>
              {isEmployeeDetail
                ? "View and manage holiday records for the selected employee."
                : canManage
                  ? "Add, edit, or remove holiday records for employees."
                  : "View your recorded holidays."}
            </Typography>
          </div>

          {loading && (
            <div className="admin-loading">
              <CircularProgress size={30} />
              <span>Loading holidays...</span>
            </div>
          )}

          {!loading && canManage && !isEmployeeDetail && (
            <>
              <div className="holiday-toolbar">
                <TextField
                  size="small"
                  label="Name"
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  sx={{ minWidth: 220 }}
                />
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="holiday-department-filter">
                    Department
                  </InputLabel>
                  <Select
                    labelId="holiday-department-filter"
                    label="Department"
                    value={selectedDepartment}
                    onChange={(event) =>
                      setSelectedDepartment(event.target.value)
                    }>
                    <MenuItem value="">All departments</MenuItem>
                    {departmentOptions.map((department) => (
                      <MenuItem key={department} value={department}>
                        {department}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setSelectedDepartment("");
                    setNameFilter("");
                  }}
                  className="holiday-button holiday-button-secondary">
                  Clear
                </Button>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Employee</th>
                      <th className="text-center">Department</th>
                      <th className="text-center">Holidays</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidaySummary.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          style={{ textAlign: "center", padding: 20 }}>
                          No employees found.
                        </td>
                      </tr>
                    ) : (
                      holidaySummary.map((employee, index) => (
                        <tr key={employee.user_id}>
                          <td>
                            <strong>{index + 1}</strong>
                          </td>
                          <td className="name-link-cell">
                            <Button
                              onClick={() =>
                                navigate(`/holidays/${employee.user_id}`)
                              }
                              className="holiday-name-button">
                              {employeeLabel(employee)}
                            </Button>
                          </td>
                          <td className="text-center">
                            {employee.department || "-"}
                          </td>
                          <td className="text-center">
                            <span className="holiday-count-pill">
                              {employee.holidayCount}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && isEmployeeDetail && detailEmployee && (
            <>
              <div className="holiday-toolbar">
                <Button
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                  onClick={() => navigate("/holidays")}
                  className="holiday-button holiday-button-secondary">
                  Back to employees
                </Button>

                <Button
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  onClick={openAddDialog}
                  className="holiday-button holiday-button-primary">
                  Add holiday
                </Button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Holiday</th>
                      <th className="text-center">Date</th>
                      <th>Notes</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHolidays.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{ textAlign: "center", padding: 20 }}>
                          No holidays found.
                        </td>
                      </tr>
                    ) : (
                      visibleHolidays.map((holiday, index) => (
                        <tr key={holiday.id}>
                          <td>
                            <strong>{index + 1}</strong>
                          </td>
                          <td>{holiday.holiday_name}</td>
                          <td className="text-center">
                            {formatDate(holiday.holiday_date)}
                          </td>
                          <td>{holiday.notes || "-"}</td>
                          <td className="text-center">
                            <Button
                              size="small"
                              aria-label="Edit holiday"
                              onClick={() => openEditDialog(holiday)}
                              className="holiday-icon-button holiday-edit-button">
                              <EditOutlinedIcon fontSize="small" />
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              aria-label="Delete holiday"
                              onClick={() => openDeleteDialog(holiday)}
                              className="holiday-icon-button holiday-delete-button">
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && !canManage && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Holiday</th>
                    <th className="text-center">Date</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHolidays.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{ textAlign: "center", padding: 20 }}>
                        No holidays found.
                      </td>
                    </tr>
                  ) : (
                    visibleHolidays.map((holiday, index) => (
                      <tr key={holiday.id}>
                        <td>
                          <strong>{index + 1}</strong>
                        </td>
                        <td>{holiday.holiday_name}</td>
                        <td className="text-center">
                          {formatDate(holiday.holiday_date)}
                        </td>
                        <td>{holiday.notes || "-"}</td>
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

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <form onSubmit={saveHoliday}>
          <DialogTitle>
            {editingHoliday ? "Edit holiday" : "Add holiday"}
          </DialogTitle>
          <DialogContent
            sx={{ display: "grid", gap: 2, pt: "16px !important" }}>
            {!isEmployeeDetail && (
              <FormControl fullWidth required>
                <InputLabel id="holiday-employee">Employee</InputLabel>
                <Select
                  labelId="holiday-employee"
                  label="Employee"
                  value={form.user_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      user_id: event.target.value,
                    }))
                  }>
                  {employees.map((employee) => (
                    <MenuItem key={employee.user_id} value={employee.user_id}>
                      {employeeLabel(employee)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              required
              label="Holiday name"
              value={form.holiday_name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  holiday_name: event.target.value,
                }))
              }
            />
            <TextField
              required
              type="date"
              value={form.holiday_date}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  holiday_date: event.target.value,
                }))
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Notes"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              multiline
              minRows={3}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button
              onClick={closeDialog}
              disabled={saving}
              className="holiday-button holiday-button-secondary">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              className="holiday-button holiday-button-primary">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onClose={closeDeleteDialog}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: "hidden",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)",
          },
        }}>
        <DialogTitle
          sx={{
            textAlign: "center",
            pb: 1,
            pt: 3,
            fontWeight: 700,
            color: "#0f172a",
          }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 10,
            }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(244, 63, 94, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
              <DeleteOutlineRoundedIcon color="error" fontSize="small" />
            </div>
          </div>
          Delete holiday?
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center", px: 3, pb: 1 }}>
          <Typography
            variant="body1"
            sx={{ color: "#475569", lineHeight: 1.6 }}>
            Are you sure you want to delete{" "}
            <strong style={{ color: "#0f172a" }}>
              {deleteDialog.holiday?.holiday_name || "this holiday"}
            </strong>{" "}
            for{" "}
            <strong style={{ color: "#0f172a" }}>
              {employeeNames[deleteDialog.holiday?.user_id] || "this employee"}
            </strong>
            ?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", gap: 1, p: 3, pt: 1 }}>
          <Button
            onClick={closeDeleteDialog}
            className="holiday-button holiday-button-secondary"
            sx={{ minWidth: 110 }}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteHoliday}
            color="error"
            variant="contained"
            className="holiday-button holiday-button-primary"
            sx={{ minWidth: 110 }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
