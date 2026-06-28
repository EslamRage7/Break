import { useEffect, useState } from "react";
import { Alert, Button, MenuItem, Snackbar, TextField } from "@mui/material";
import Sidebar from "../components/Sidebar";
import { supabase } from "../supabaseClient";
import Footer from "../components/Footer";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";

export default function Settings() {
  const [userId, setUserId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [department, setDepartment] = useState("");
  const [gender, setGender] = useState("");
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
    department: "",
    gender: "",
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
      borderRadius: "15px",
    },
  };

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
          .select("first_name,last_name,department,gender")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        const genderString =
          data?.gender === true
            ? "true"
            : data?.gender === false
              ? "false"
              : "";

        setFirstName(data?.first_name || "");
        setLastName(data?.last_name || "");
        setDepartment(data?.department || "");
        setGender(genderString);

        setOriginalData({
          firstName: data?.first_name || "",
          lastName: data?.last_name || "",
          department: data?.department || "",
          gender: genderString,
        });
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Failed to load settings", "error");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim() || !department || !gender) {
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
      department !== originalData.department ||
      gender !== originalData.gender;

    const passwordChanged = password.trim() !== "";

    if (!profileChanged && !passwordChanged) {
      showMessage("No changes detected", "info");
      return;
    }

    setSaving(true);

    try {
      if (profileChanged) {
        const { error: profileError } = await supabase
          .from("employees")
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            department,
            gender: gender === "true",
          })
          .eq("user_id", userId);

        if (profileError) throw profileError;
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
        department,
        gender,
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
            <h1>Settings</h1>
          </div>

          <div className="settings-form">
            <div className="form-row">
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
            </div>

            <div className="form-row">
              <TextField
                size="small"
                select
                label="Gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={loading || saving}
                fullWidth
                sx={textFieldStyle}
              >
                <MenuItem value="">Select Gender</MenuItem>
                <MenuItem value="true">Male</MenuItem>
                <MenuItem value="false">Female</MenuItem>
              </TextField>

              <TextField
                size="small"
                select
                label="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={loading || saving}
                fullWidth
                sx={textFieldStyle}
              >
                <MenuItem value="">Select Department</MenuItem>
                <MenuItem value="Call Center">Call Center</MenuItem>
                <MenuItem value="Graphic Design">Graphic Design</MenuItem>
                <MenuItem value="Data Entry">Data Entry</MenuItem>
                <MenuItem value="Development">Development</MenuItem>
                <MenuItem value="Packaging">Packaging</MenuItem>
              </TextField>
            </div>

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
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleTogglePassword}
                        edge="end"
                        sx={{
                          p: "4px",
                          color: "#000",
                          marginRight: "2px",
                          backgroundColor: "transparent",
                          "&:hover": {
                            backgroundColor: "transparent",
                          },
                        }}
                      >
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

            <Button
              variant="contained"
              className="m-auto sign-btn"
              onClick={handleSave}
              disabled={loading || saving}
              sx={{
                py: 1.2,
                borderRadius: 6,
                fontWeight: 700,
                textTransform: "none",
              }}
            >
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
        }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
