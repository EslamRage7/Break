import { useCallback, useEffect, useMemo, useState } from "react";
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
import Typography from "@mui/material/Typography";
import { getBreakLimitForDepartment } from "../utils/breakUtils";

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

const getEndTimeValue = (item) => {
  if (item?.paused_at) {
    return item.paused_at;
  }

  return item.end_time || "";
};

const getSegmentDay = (item) => {
  if (!item?.start_time) return "";

  const date = new Date(item.start_time);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
  }).format(date);
};

const getSegmentUsedSeconds = (item) => {
  const hasStoredSeconds =
    item?.duration_seconds !== null &&
    item?.duration_seconds !== undefined &&
    item?.duration_seconds !== "";

  if (hasStoredSeconds) {
    const storedSeconds = Number(item.duration_seconds);
    if (Number.isFinite(storedSeconds) && storedSeconds >= 0) {
      return Math.floor(storedSeconds);
    }
  }

  if (!item || !item.start_time) return 0;

  const start = new Date(item.start_time);
  if (Number.isNaN(start.getTime())) return 0;

  const endText = getEndTimeValue(item);
  const end = endText ? new Date(endText) : new Date();
  if (Number.isNaN(end.getTime())) return 0;

  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
};

const getTodayDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
  }).format(new Date());

const formatDuration = (minutes, seconds) => {
  if (!minutes && !seconds) return "-";

  const totalMinutes = minutes || 0;
  const totalSeconds = seconds || 0;

  if (!totalMinutes) return `${totalSeconds}s`;
  if (!totalSeconds) return `${totalMinutes}m`;

  return `${totalMinutes}m ${totalSeconds}s`;
};

const departmentNames = {
  CS: "Call Center",
  GD: "Graphic Design",
  DE: "Data Entry",
  DV: "Development",
  PK: "Packaging",
  MG: "Management",
};

const normalizeDepartmentValue = (value) => {
  const text = `${value || ""}`.trim().toLowerCase();
  if (!text) return "";

  const compact = text.replace(/[^a-z0-9]+/g, "");

  const departmentCode = Object.keys(departmentNames).find((key) => {
    return key.toLowerCase() === text || key.toLowerCase() === compact;
  });

  if (departmentCode) return departmentCode.toLowerCase();

  const labelMatch = Object.entries(departmentNames).find(([, label]) => {
    const normalizedLabel = `${label || ""}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    return normalizedLabel === compact;
  });

  return labelMatch ? labelMatch[0].toLowerCase() : compact;
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

export default function BreaksTable() {
  const [breaks, setBreaks] = useState([]);
  const [breakSessions, setBreakSessions] = useState([]);
  const [nameQuery, setNameQuery] = useState("");
  const [dayQuery, setDayQuery] = useState("");
  const [departmentQuery, setDepartmentQuery] = useState("");
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

  const employeeById = useMemo(() => {
    return employees.reduce((acc, employee) => {
      if (employee?.user_id) acc[employee.user_id] = employee;
      return acc;
    }, {});
  }, [employees]);

  const departmentOptions = useMemo(() => {
    const map = new Map();

    (employees || []).forEach((employee) => {
      const code = normalizeDepartmentValue(employee?.department);
      if (!code) return;
      if (!map.has(code)) {
        const label =
          departmentNames[code.toUpperCase()] ||
          getDepartmentLabel(employee?.department);
        map.set(code, label);
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees]);

  const getDisplayDurationMinutes = (item) => {
    const employee = employeeById[item?.user_id];
    const durationMinutes = Number(item?.duration_minutes);
    const isCallCenter =
      getBreakLimitForDepartment(employee?.department) === 60;

    if (isCallCenter) {
      return 60;
    }

    if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return durationMinutes;
    }

    return Math.floor((Number(item?.duration_seconds) || 0) / 60);
  };

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
            .select("role, team_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (currentEmployeeError) throw currentEmployeeError;

        if (
          currentEmployee?.role !== "admin" &&
          currentEmployee?.role !== "team_leader"
        ) {
          setIsAdmin(false);
          return;
        }

        setIsAdmin(true);

        const { data: adminData, error: adminError } =
          await supabase.functions.invoke("admin-data");

        if (adminError) throw adminError;

        if (!adminData?.success) {
          throw new Error(adminData?.message || "Failed to load break data");
        }

        let employeeRows = adminData?.employees || [];
        let breakRows = adminData?.break_segments || [];
        let sessionRows = adminData?.breaks || [];

        // Team Leader => يشوف فريقه فقط
        if (currentEmployee?.role === "team_leader") {
          employeeRows = employeeRows.filter(
            (e) => e.team_id === currentEmployee.team_id,
          );

          const teamIds = employeeRows.map((e) => e.user_id);

          breakRows = breakRows.filter((b) => teamIds.includes(b.user_id));
          sessionRows = sessionRows.filter((s) => teamIds.includes(s.user_id));
        }

        setEmployees(employeeRows);
        setBreaks(breakRows);
        setBreakSessions(sessionRows);
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Failed to load breaks table", "error");
      } finally {
        setLoading(false);
      }
    };

    loadBreaks();
  }, []);

  const lastSegmentByUser = useMemo(() => {
    return (breaks || []).reduce((acc, segment) => {
      if (!segment?.user_id) return acc;
      const current = acc[segment.user_id];
      if (!current) {
        acc[segment.user_id] = segment;
        return acc;
      }

      const currentTime = new Date(current.start_time || 0).getTime();
      const segmentTime = new Date(segment.start_time || 0).getTime();
      if (segmentTime > currentTime) {
        acc[segment.user_id] = segment;
      }
      return acc;
    }, {});
  }, [breaks]);

  const breakSessionByUser = useMemo(() => {
    return (breakSessions || []).reduce((acc, session) => {
      if (session?.user_id) {
        acc[session.user_id] = session;
      }
      return acc;
    }, {});
  }, [breakSessions]);

  const getEffectiveStatus = useCallback(
    (item) => {
      const session = breakSessionByUser[item?.user_id] || item;
      if (session?.is_paused) return "paused";

      const status = (session?.status || item?.status || "").toLowerCase();
      if (status === "completed") return "completed";
      if (status === "active") return "active";

      if (item?.paused_at) return "paused";
      if (item?.end_time) return "completed";
      return "active";
    },
    [breakSessionByUser],
  );

  const filteredBreaks = useMemo(() => {
    return (breakSessions || []).filter((item) => {
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
        const effectiveStatus = getEffectiveStatus(item);

        if (statusQuery === "paused") {
          if (effectiveStatus !== "paused") return false;
        } else if (statusQuery === "active") {
          if (effectiveStatus !== "active") return false;
        } else if (statusQuery === "completed") {
          if (effectiveStatus !== "completed") return false;
        } else {
          if (effectiveStatus !== statusQuery) return false;
        }
      }

      // filter by department
      if (departmentQuery) {
        const employee = employeeById[item?.user_id];
        const employeeDeptValue = normalizeDepartmentValue(
          employee?.department,
        );
        const filterDeptValue = normalizeDepartmentValue(departmentQuery);

        if (!employee || employeeDeptValue !== filterDeptValue) return false;
      }

      return true;
    });
  }, [
    breakSessions,
    employeeById,
    nameQuery,
    dayQuery,
    statusQuery,
    departmentQuery,
    getEffectiveStatus,
  ]);

  const latestBreaks = useMemo(() => {
    return (filteredBreaks || [])
      .slice()
      .sort(
        (a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0),
      );
  }, [filteredBreaks]);

  const usedMinutesTodayByUser = useMemo(() => {
    const usage = {};
    const today = getTodayDate();

    (breaks || []).forEach((segment) => {
      const userId = segment?.user_id;
      if (!userId || getSegmentDay(segment) !== today) return;

      usage[userId] = (usage[userId] || 0) + getSegmentUsedSeconds(segment);
    });

    Object.keys(usage).forEach((key) => {
      usage[key] = Math.floor(usage[key] / 60);
    });

    return usage;
  }, [breaks]);

  const getUsedMinutesToday = (item) => {
    return usedMinutesTodayByUser[item?.user_id] || 0;
  };

  const employeesInBreaks = useMemo(() => {
    const ids = new Set((breakSessions || []).map((b) => b.user_id));
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
  }, [breakSessions, employees]);

  const availableDates = useMemo(() => {
    const set = new Set();
    (breakSessions || []).forEach((b) => {
      if (b.start_time) set.add(b.start_time.split("T")[0]);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [breakSessions]);

  const getStatusLabel = (item) => {
    const effectiveStatus = getEffectiveStatus(item);

    if (effectiveStatus === "paused") return "Paused";
    if (effectiveStatus === "completed") return "Completed";
    if (effectiveStatus === "active") return "Active";
    return item.status || "-";
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content">
        <div className="settings-panel admin-panel">
          <div className="settings-header">
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a" }}>
              Break Management
            </Typography>

            <Typography variant="body2" sx={{ mt: 0.5, color: "#64748b" }}>
              View all employee breaks, monitor active sessions, and filter
              break records.
            </Typography>
          </div>

          {loading && (
            <div className="admin-loading text-center justify-content-center ">
              <CircularProgress size={30} />
              <span>Loading table...</span>
            </div>
          )}

          {!loading && !isAdmin && (
            <div className="admin-empty text-center justify-content-center ">
              You do not have permission to view this page.
            </div>
          )}

          {!loading && isAdmin && (
            <div>
              <div className="holiday-toolbar">
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
                    <MenuItem value="all">All </MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="completed">Completed</MenuItem>
                    <MenuItem value="paused">Paused</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" style={{ minWidth: 180 }}>
                  <InputLabel id="department-select-label">
                    Department
                  </InputLabel>
                  <Select
                    labelId="department-select-label"
                    label="Department"
                    value={departmentQuery}
                    onChange={(e) => setDepartmentQuery(e.target.value)}>
                    <MenuItem value="">All</MenuItem>
                    {departmentOptions.map((department) => (
                      <MenuItem key={department.value} value={department.value}>
                        {department.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setNameQuery("");
                    setDayQuery("");
                    setStatusQuery("");
                    setDepartmentQuery("");
                  }}
                  className="holiday-button holiday-button-secondary"
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
                      <th>Name</th>
                      <th className="text-center">Department</th>
                      <th className="text-center">Start Time</th>
                      <th className="text-center">End Time</th>
                      <th className="text-center">Duration</th>
                      <th className="text-center">Used</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {latestBreaks.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{ textAlign: "center", padding: 20 }}>
                          No breaks match your filters.
                        </td>
                      </tr>
                    ) : (
                      latestBreaks.map((item, index) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{index + 1}</strong>
                          </td>
                          <td className="text-capitalize name-link-cell">
                            <button
                              className="text-capitalize holiday-name-button bg-transparent border-0 p-0 m-0"
                              onClick={() =>
                                navigate(`/employee-breaks/${item.user_id}`)
                              }>
                              {employeeNamesById[item.user_id] || item.user_id}
                            </button>
                          </td>
                          <td className="text-center">
                            {getDepartmentLabel(
                              employeeById[item.user_id]?.department,
                            )}
                          </td>
                          <td className="text-center">
                            {formatDateTime(item.start_time)}
                          </td>
                          <td className="text-center">
                            {formatDateTime(getEndTimeValue(item))}
                          </td>
                          <td className="text-center">
                            {getDisplayDurationMinutes(item)}m
                          </td>
                          <td className="text-center">
                            {formatDuration(getUsedMinutesToday(item))}
                          </td>
                          <td className="text-center">
                            {(() => {
                              const effectiveStatus = getEffectiveStatus(item);
                              const pillClass =
                                effectiveStatus === "paused"
                                  ? "table-pill-warning"
                                  : effectiveStatus === "active"
                                    ? "table-pill-success"
                                    : "table-pill-neutral";

                              return (
                                <span className={`table-pill ${pillClass}`}>
                                  {getStatusLabel(item)}
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
