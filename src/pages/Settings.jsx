import { useCallback, useEffect, useState } from "react";
import { Alert, Button, MenuItem, Snackbar, TextField } from "@mui/material";
import Sidebar from "../components/Sidebar";
import { supabase } from "../supabaseClient";
import { getBreakLimitForDepartment } from "../utils/breakUtils";
import Footer from "../components/Footer";
import {
  BadgeRounded,
  LockRounded,
  PersonRounded,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

export default function Settings() {
  const [userId, setUserId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [gender, setGender] = useState("");
  const [role, setRole] = useState("");
  const [shift, setShift] = useState("");
  const [shifts, setShifts] = useState([]);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleTogglePassword = () => {
    setShowPassword((prev) => !prev);
  };

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const [originalData, setOriginalData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    department: "",
    gender: "",
    shift: "",
  });

  const showMessage = (message, severity = "info") => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const textFieldStyle = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      backgroundColor: "#ffffff",
      transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      "&:hover": {
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.07)",
      },
      "&.Mui-focused": {
        boxShadow: "0 0 0 4px rgba(0, 166, 235, 0.12)",
      },
      "&.Mui-disabled": {
        backgroundColor: "#f8fafc",
      },
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#00a6eb",
    },
  };

  const departmentNames = {
    CS: "Call Center",
    GD: "Graphic Design",
    DE: "Data Entry",
    DV: "Development",
    PK: "Packaging",
    MG: "Management",
  };

  const getDepartmentLabel = (value) => {
    const text = `${value || ""}`.trim();
    if (!text) return "";

    const normalizedText = text.toLowerCase().replace(/[^a-z0-9]+/g, "");

    const directMatch = Object.entries(departmentNames).find(([key]) => {
      return key.toLowerCase() === normalizedText;
    });

    if (directMatch) {
      return directMatch[1];
    }

    const labelMatch = Object.entries(departmentNames).find(([, label]) => {
      const normalizedLabel = `${label || ""}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      return normalizedLabel === normalizedText;
    });

    return labelMatch ? labelMatch[1] : text;
  };

  const departmentOptions = Object.entries(departmentNames).map(
    ([value, label]) => ({ value, label }),
  );

  const getDepartmentCode = useCallback((value) => {
    const text = `${value || ""}`.trim();
    if (!text) return "";

    // direct key match (case-insensitive)
    const keyMatch = Object.keys(departmentNames).find(
      (k) => k.toLowerCase() === text.toLowerCase(),
    );
    if (keyMatch) return keyMatch;

    // label match (case-insensitive)
    const labelMatch = Object.entries(departmentNames).find(
      ([, label]) =>
        `${label || ""}`.trim().toLowerCase() === text.toLowerCase(),
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

    // fallback to original value (useful for custom departments)
    return text;
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user?.id) throw new Error("Please login again");

        setUserId(user.id);

        const { data, error } = await supabase
          .from("employees")
          .select("first_name,last_name,email,department,gender,role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        const [
          { data: shiftRows, error: shiftError },
          { data: employeeShiftRow, error: employeeShiftError },
        ] = await Promise.all([
          supabase
            .from("shifts")
            .select("id,shift_name")
            .order("shift_name", { ascending: true }),
          supabase
            .from("employee_shifts")
            .select("shift_id")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        if (shiftError) throw shiftError;
        if (employeeShiftError) throw employeeShiftError;

        setShifts(shiftRows || []);
        setShift(employeeShiftRow?.shift_id || "");

        const genderString =
          data?.gender === true
            ? "true"
            : data?.gender === false
              ? "false"
              : "";

        setFirstName(data?.first_name || "");
        setLastName(data?.last_name || "");
        setEmail(data?.email || "");
        setDepartment(getDepartmentCode(data?.department) || "");
        setGender(genderString);
        setRole(data?.role || "");

        setOriginalData({
          firstName: data?.first_name || "",
          lastName: data?.last_name || "",
          email: data?.email || "",
          department: getDepartmentCode(data?.department) || "",
          gender: genderString,
          shift: employeeShiftRow?.shift_id || "",
        });
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Failed to load settings", "error");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [getDepartmentCode]);

  const handleSave = async () => {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !department ||
      !gender
    ) {
      showMessage("Please fill all profile fields", "warning");
      return;
    }

    if (password && password.length < 6) {
      showMessage("Password must be at least 6 characters", "warning");
      return;
    }

    const profileChanged =
      firstName.trim() !== originalData.firstName ||
      lastName.trim() !== originalData.lastName ||
      email.trim() !== originalData.email ||
      department !== originalData.department ||
      gender !== originalData.gender;

    const shiftChanged = shift !== originalData.shift;
    const passwordChanged = password.trim() !== "";

    if (!profileChanged && !shiftChanged && !passwordChanged) {
      showMessage("No changes detected", "info");
      return;
    }

    setSaving(true);

    try {
      if (profileChanged) {
        const resolvedLimit = getBreakLimitForDepartment(department);
        const { error: profileError } = await supabase
          .from("employees")
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim(),
            department,
            gender: gender === "true",
            daily_break_limit: resolvedLimit,
          })
          .eq("user_id", userId);

        if (profileError) throw profileError;
      }

      if (shiftChanged) {
        const { data: existingShiftRow, error: existingShiftError } =
          await supabase
            .from("employee_shifts")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

        if (existingShiftError) throw existingShiftError;

        if (shift) {
          if (existingShiftRow?.id) {
            const { error: updateShiftError } = await supabase
              .from("employee_shifts")
              .update({ shift_id: shift })
              .eq("id", existingShiftRow.id);

            if (updateShiftError) throw updateShiftError;
          } else {
            const { error: insertShiftError } = await supabase
              .from("employee_shifts")
              .insert({ user_id: userId, shift_id: shift });

            if (insertShiftError) throw insertShiftError;
          }
        } else if (existingShiftRow?.id) {
          const { error: deleteShiftError } = await supabase
            .from("employee_shifts")
            .delete()
            .eq("id", existingShiftRow.id);

          if (deleteShiftError) throw deleteShiftError;
        }
      }

      if (passwordChanged) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password,
        });

        if (passwordError) throw passwordError;

        setPassword("");
      }

      setOriginalData({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        department,
        gender,
        shift,
      });

      showMessage("Settings updated successfully", "success");
    } catch (err) {
      console.error(err);
      showMessage(err.message || "Failed to update settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <section className="dashboard-content ">
        <div className="settings-panel">
          <div className="settings-header">
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a" }}>
              Profile Settings
            </Typography>

            <Typography variant="body2" sx={{ mt: 0.5, color: "#64748b" }}>
              Update your personal information, change your password, and view
              your assigned shift.
            </Typography>
          </div>

          <div className="settings-form">
            <div className="settings-form-top">
              <div className="settings-avatar" aria-hidden="true">
                {`${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() ||
                  "U"}
              </div>

              <div className="settings-user-copy">
                <strong>
                  {`${firstName || ""} ${lastName || ""}`.trim() ||
                    "Your Profile"}
                </strong>
                <span>{email || "Account settings"}</span>
              </div>

              {role && <span className="settings-role-chip">{role}</span>}
            </div>

            <div className="settings-section-title mb-4">
              <PersonRounded fontSize="small" />
              <span>Personal Details</span>
            </div>

            <div className="settings-grid">
              <TextField
                size="small"
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading || saving}
                fullWidth
                sx={textFieldStyle}
              />

              <TextField
                size="small"
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading || saving}
                fullWidth
                sx={textFieldStyle}
              />

              <TextField
                size="small"
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled
                fullWidth
                sx={textFieldStyle}
              />

              <TextField
                size="small"
                select
                label="Gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={loading || saving}
                fullWidth
                sx={textFieldStyle}>
                <MenuItem value="">Select Gender</MenuItem>
                <MenuItem value="true">Male</MenuItem>
                <MenuItem value="false">Female</MenuItem>
              </TextField>
            </div>

            <div className="settings-section-title my-4">
              <BadgeRounded fontSize="small" />
              <span>Work Details</span>
            </div>

            <div className="settings-grid">
              {role === "admin" ? (
                <TextField
                  size="small"
                  select
                  label="Department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={loading || saving}
                  fullWidth
                  sx={textFieldStyle}>
                  <MenuItem value="">Select Department</MenuItem>
                  {departmentOptions.map((item) => (
                    <MenuItem key={item.value} value={item.value}>
                      {item.label}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  size="small"
                  label="Department"
                  value={getDepartmentLabel(department)}
                  disabled
                  fullWidth
                  sx={textFieldStyle}
                />
              )}

              {role === "admin" || role === "team_leader" ? (
                <TextField
                  size="small"
                  select
                  label="Shift"
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  disabled={loading || saving}
                  fullWidth
                  sx={textFieldStyle}>
                  <MenuItem value="">No Shift Assigned</MenuItem>
                  {shifts.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.shift_name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  size="small"
                  label="Shift"
                  value={
                    shifts.find((item) => item.id === shift)?.shift_name ||
                    "No Shift Assigned"
                  }
                  fullWidth
                  disabled
                  sx={textFieldStyle}
                />
              )}
            </div>

            <div className="settings-section-title">
              <LockRounded fontSize="small" />
              <span>Password</span>
            </div>

            <div className="settings-password-row">
              <TextField
                size="small"
                label="New Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || saving}
                helperText="Leave empty if you do not want to change it"
                fullWidth
                sx={textFieldStyle}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockRounded sx={{ color: "#64748b", fontSize: 19 }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={handleTogglePassword}
                          edge="end"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          sx={{
                            p: "4px",
                            color: "#0f172a",
                            marginRight: "2px",
                            backgroundColor: "transparent",
                            "&:hover": {
                              backgroundColor: "transparent",
                            },
                          }}>
                          {showPassword ? (
                            <VisibilityOff sx={{ fontSize: 20 }} />
                          ) : (
                            <Visibility sx={{ fontSize: 20 }} />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </div>

            <Button
              variant="contained"
              className="sign-btn settings-save-btn"
              onClick={handleSave}
              disabled={loading || saving}
              sx={{
                py: 1,
                px: 3,
                width: "100%",
                maxWidth: "250px",
                display: "block",
                margin: "0 auto",
                borderRadius: 6,
                fontWeight: 700,
                textTransform: "none",
                fontSize: "16px",
              }}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
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
