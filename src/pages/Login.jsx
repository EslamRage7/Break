import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import { TextField, Button, Snackbar, Alert } from "@mui/material";

import logo from "../assets/logo.png";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleTogglePassword = () => {
    setShowPassword((prev) => !prev);
  };

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

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        navigate("/home", { replace: true });
      }
    };

    checkSession();
  }, [navigate]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showMessage("Please fill in all fields", "warning");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      console.log("LOGIN DATA:", data);

      showMessage("Login successful! Redirecting...", "success");

      setTimeout(() => {
        navigate("/home", { replace: true });
      }, 3000);
    } catch (err) {
      console.error(err);

      if (err.message === "Invalid login credentials") {
        showMessage("User not found or password is incorrect", "error");
      } else {
        showMessage(err.message || "Login failed", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login ">
      <div className="container min-vh-100 d-flex justify-content-center align-items-center py-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-100"
          style={{ maxWidth: "500px" }}
        >
          <div className="card shadow-lg border-0 rounded-4">
            <div className="card-body text-center p-4">
              {/* Logo */}
              <div className="text-center mb-3">
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
              </div>

              {/* Title */}
              <h2 className="fw-bold text-center mb-2">Welcome Back</h2>

              <p className="text-center text-muted mb-4">
                Take Better Breaks, Work Better
              </p>

              {/* Form */}
              <div className="d-flex flex-column gap-3">
                <TextField
                  size="small"
                  label="Email Address"
                  type="email"
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "15px",
                    },
                  }}
                />

                <TextField
                  size="small"
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
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
                  fullWidth
                  disabled={loading}
                  className="text-white sign-btn"
                  onClick={handleLogin}
                  sx={{
                    py: 1.2,
                    borderRadius: 5,
                    fontWeight: 700,
                    textTransform: "none",
                  }}
                >
                  {loading ? "Signing In..." : "Sign In"}
                </Button>

                <div className="text-center moving">
                  <Link
                    to="/register"
                    className="text-decoration-none text-black fw-bold"
                  >
                    Don't have an account? <span>Sign Up</span>
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
