import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { sendVerificationCodeEmail } from "../utils/emailService";
import logo from "../assets/logo.png";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { supabase } from "../supabaseClient";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import {
  TextField,
  Button,
  Snackbar,
  Box,
  Alert,
  MenuItem,
} from "@mui/material";

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [first_name, setFirstName] = useState("");
  const [last_name, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [department, setDepartment] = useState("");
  const [teamId, setTeamId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const handleTogglePassword = () => {
    setShowPassword((prev) => !prev);
  };

  const showMessage = (message, severity = "info") => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setDepartment("");
    setGender("");
  };

  const handleRegister = async () => {
    if (
      !email.trim() ||
      !password.trim() ||
      !first_name.trim() ||
      !last_name.trim() ||
      !department ||
      gender === ""
    ) {
      showMessage("Please fill all fields", "warning");
      return;
    }

    if (password.length < 6) {
      showMessage("Password must be at least 6 characters", "warning");
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data: existingUser, error: checkError } = await supabase
        .from("employees")
        .select("email")
        .ilike("email", normalizedEmail)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingUser) {
        showMessage("This email is already registered.", "warning");
        setLoading(false);
        return;
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expire = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const emailResult = await sendVerificationCodeEmail(
        normalizedEmail,
        code,
        first_name.trim(),
        last_name.trim(),
      );
      const emailSendFailed = !emailResult.success;

      // 2. Save temp data locally (until verification)
      const pendingUser = {
        email: normalizedEmail,
        password,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        department,
        gender,
        team_id: teamId,
        code,
        expire,
      };
      localStorage.setItem("temp_user", JSON.stringify(pendingUser));

      if (emailSendFailed) {
        showMessage(
          `Verification email could not be sent. Use this code: ${code}`,
          "warning",
        );
      } else {
        showMessage(
          "Verification code has been sent to your email.",
          "success",
        );
      }

      resetForm();

      // 4. Navigate to verify page
      navigate("/verify-email", {
        state: {
          email: normalizedEmail,
          fallbackCode: emailSendFailed ? code : undefined,
        },
      });
    } catch (err) {
      showMessage(err.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register">
      <div className="container min-vh-100 d-flex justify-content-center align-items-center py-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-100"
          style={{ maxWidth: "500px" }}>
          <div className="card shadow-lg border-0 rounded-4">
            <div className="card-body text-center p-4">
              <Box sx={{ mb: 2 }}>
                <motion.img
                  src={logo}
                  alt="BreakApp Logo"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    duration: 0.5,
                    type: "spring",
                    stiffness: 120,
                  }}
                  style={{
                    width: "120px",
                    height: "120px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    boxShadow: "0 8px 25px rgba(0,0,0,.15)",
                  }}
                />
              </Box>

              <h2 className="fw-bold text-center mb-2">Create Account</h2>

              <p className="text-muted text-center mb-4">
                Join us and start managing your breaks
              </p>

              <div className="d-flex flex-column gap-3">
                <div className="row g-3">
                  <div className="col-md-6">
                    <TextField
                      size="small"
                      label="First Name"
                      value={first_name}
                      onChange={(e) => setFirstName(e.target.value)}
                      fullWidth
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "15px",
                        },
                      }}
                    />
                  </div>

                  <div className="col-md-6">
                    <TextField
                      size="small"
                      label="Last Name"
                      value={last_name}
                      onChange={(e) => setLastName(e.target.value)}
                      fullWidth
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "15px",
                        },
                      }}
                    />
                  </div>
                </div>

                <TextField
                  size="small"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "15px",
                    },
                  }}
                />

                <div className="row g-3">
                  <div className="col-md-6 text-start">
                    <TextField
                      size="small"
                      select
                      label="Gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      fullWidth
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "15px",
                        },
                      }}>
                      <MenuItem value="">Select Gender</MenuItem>
                      <MenuItem value="true">Male</MenuItem>
                      <MenuItem value="false">Female</MenuItem>
                    </TextField>
                  </div>

                  <div className="col-md-6 text-start">
                    <TextField
                      size="small"
                      select
                      label="Department"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      fullWidth
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "15px",
                        },
                      }}>
                      <MenuItem value="">Select Department</MenuItem>
                      <MenuItem value="Call Center">Call Center</MenuItem>
                      <MenuItem value="Graphic Design">Graphic Design</MenuItem>
                      <MenuItem value="Data Entry">Data Entry</MenuItem>
                      <MenuItem value="Development">Development</MenuItem>
                      <MenuItem value="Packaging">Packaging</MenuItem>
                    </TextField>
                  </div>
                </div>

                <TextField
                  size="small"
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "15px",
                    },
                  }}
                  slotProps={{
                    input: {
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
                              color: "#000",
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

                <Button
                  variant="contained"
                  className="text-white sign-btn"
                  fullWidth
                  onClick={handleRegister}
                  disabled={loading}
                  sx={{
                    py: 1.2,
                    borderRadius: 6,
                    fontWeight: 700,
                    textTransform: "none",
                  }}>
                  {loading ? "Creating Account..." : "Sign Up"}
                </Button>

                <div className="text-center moving">
                  <Link
                    to="/login"
                    className="text-decoration-none text-black fw-bold">
                    Already have an account? <span>Sign in</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() =>
          setSnackbar((prev) => ({
            ...prev,
            open: false,
          }))
        }>
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
