import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { sendVerificationCodeEmail } from "../utils/emailService";
import logo from "../assets/logo.png";
import { TextField, Button, Snackbar, Alert, Box } from "@mui/material";

function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();

  const [tempUser, setTempUser] = useState(() => {
    if (typeof window === "undefined") return null;

    try {
      return JSON.parse(localStorage.getItem("temp_user") || "null");
    } catch {
      return null;
    }
  });

  const fallbackCode = location.state?.fallbackCode;
  const email = location.state?.email || tempUser?.email;

  const [code, setCode] = useState(() => Array(6).fill(""));
  const inputsRef = useRef([]);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  useEffect(() => {
    if (!email || !tempUser) {
      navigate("/register");
    }
  }, [email, tempUser, navigate]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft]);

  const showMessage = (message, severity = "info") => {
    setSnackbar({ open: true, message, severity });
  };

  const formatFunctionError = async (error) => {
    if (!error) return "";

    const response = error.response || error.context;
    if (response) {
      try {
        const text = await response.text();
        if (text) {
          try {
            const json = JSON.parse(text);
            return `${error.message} - ${json.message || JSON.stringify(json)}`;
          } catch {
            return `${error.message} - ${text}`;
          }
        }
      } catch {
        // ignore parse failure
      }
    }

    return error.message || JSON.stringify(error);
  };

  const fillCode = (digits) => {
    const nextCode = Array(6).fill("");

    digits.slice(0, 6).forEach((digit, index) => {
      nextCode[index] = digit;
    });

    setCode(nextCode);
    inputsRef.current[5]?.focus();
  };

  const handleResend = async () => {
    if (!tempUser || timeLeft > 0) return;

    try {
      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expire = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const updatedTempUser = {
        ...tempUser,
        code: newCode,
        expire,
      };

      const emailResult = await sendVerificationCodeEmail(
        tempUser.email,
        newCode,
        tempUser.first_name,
        tempUser.last_name,
      );
      const returnedCode = newCode;
      const updatedTempUserWithCode = {
        ...updatedTempUser,
        code: returnedCode,
      };

      localStorage.setItem(
        "temp_user",
        JSON.stringify(updatedTempUserWithCode),
      );
      setTempUser(updatedTempUserWithCode);

      if (!emailResult.success) {
        showMessage(
          `A new code has been generated but email could not be delivered. Use this code: ${returnedCode}`,
          "warning",
        );
      } else {
        showMessage(
          "A new verification code has been sent to your email.",
          "success",
        );
      }

      setTimeLeft(60);
      setCanResend(false);
    } catch (err) {
      showMessage(err.message || "Failed to resend code", "error");
    }
  };

  const handleChange = (value, index) => {
    if (!/^\d*$/.test(value)) return;

    if (value.length > 1) {
      fillCode(value.replace(/\D/g, "").split(""));
      return;
    }

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").slice(0, 6);

    if (!/^\d+$/.test(pasted)) return;

    fillCode(pasted.split(""));
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const fullCode = code.join("");
  const handleVerify = async () => {
    if (fullCode.length < 6) {
      showMessage("Please enter verification code", "warning");
      return;
    }

    if (!tempUser) {
      showMessage(
        "Registration session expired. Please register again.",
        "error",
      );
      navigate("/register");
      return;
    }

    setLoading(true);

    try {
      const now = Date.now();
      const expire = new Date(tempUser.expire).getTime();

      if (now > expire) {
        localStorage.removeItem("temp_user");
        setTempUser(null);
        showMessage(
          "Verification code expired. Please register again.",
          "error",
        );
        navigate("/register");
        return;
      }

      if (tempUser.code !== fullCode) {
        throw new Error("Invalid verification code");
      }

      let createdUserData;
      let createUserError = null;
      let functionResult = null;

      try {
        functionResult = await supabase.functions.invoke(
          "create-verified-user",
          {
            body: {
              email: tempUser.email,
              password: tempUser.password,
              team_id: tempUser.team_id,
              user_metadata: {
                first_name: tempUser.first_name,
                last_name: tempUser.last_name,
                department: tempUser.department,
                gender: tempUser.gender,
              },
            },
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        console.log("========== Function Result ==========");

        if (functionResult.error) {
          console.log("Function Error:", functionResult.error);

          if (functionResult.error.context) {
            console.log(await functionResult.error.context.text());
          }
        }

        console.log("Data:", functionResult?.data);
        console.log("Error:", functionResult?.error);
        console.log("====================================");

        createdUserData = functionResult?.data;
        createUserError = functionResult?.error;
      } catch (err) {
        console.error("create-verified-user invoke failed", err);
        console.log("STATUS:", functionResult);
        createUserError = err;
      }

      console.log("Function Result:", functionResult);
      console.log("Data:", functionResult?.data);
      console.log("Error:", functionResult?.error);
      if (createUserError) {
        const isMissingFunction =
          createUserError?.message?.includes("Not Found") ||
          createUserError?.status === 404;

        if (!isMissingFunction) {
          const errorMessage = await formatFunctionError(createUserError);
          throw new Error(
            errorMessage ||
              createUserError.message ||
              "Function invocation failed",
          );
        }

        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
            email: tempUser.email,
            password: tempUser.password,
            options: {
              data: {
                first_name: tempUser.first_name,
                last_name: tempUser.last_name,
                department: tempUser.department,
                gender: tempUser.gender,
              },
            },
          });

        if (signUpError) throw signUpError;
        createdUserData = signUpData;
      }

      const createdUserId = createdUserData?.user?.id || createdUserData?.id;

      if (!createdUserId) {
        throw new Error("Failed to create authenticated account");
      }

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: tempUser.email,
          password: tempUser.password,
        });

      if (signInError) {
        throw signInError;
      }
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id")
        .eq("team_name", tempUser.department)
        .single();

      if (teamError) throw teamError;
      const employeeData = {
        user_id: createdUserId,
        email: tempUser.email,
        first_name: tempUser.first_name,
        last_name: tempUser.last_name,
        department: tempUser.department,
        team_id: team.id,
        gender: tempUser.gender === "true" || tempUser.gender === true,
        role: "employee",
        verified: true,
        verification_code: null,
        verification_expire: null,
        break_minutes_remaining: 45,
        break_reset_date: new Date().toISOString().split("T")[0],
        break_used_today: 0,
        daily_break_limit: 45,
      };

      const { data: existingEmployee, error: selectError } = await supabase
        .from("employees")
        .select("user_id")
        .eq("user_id", createdUserId)
        .maybeSingle();

      if (selectError) throw selectError;

      const { error: saveError } = existingEmployee
        ? await supabase
            .from("employees")
            .update(employeeData)
            .eq("user_id", createdUserId)
        : await supabase.from("employees").insert([employeeData]);

      if (saveError) throw saveError;

      localStorage.removeItem("temp_user");
      showMessage(
        "Email verified successfully! Redirecting to the site...",
        "success",
      );
      setTimeout(() => {
        navigate("/home", { replace: true });
      }, 1500);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : JSON.stringify(err);
      showMessage(errorMessage || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="container min-vh-100 d-flex justify-content-center align-items-center py-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-100"
          style={{ maxWidth: "500px" }}>
          <div className="card shadow-lg border-0 rounded-4">
            <div className="card-body text-center p-4">
              {/* Logo */}
              <Box sx={{ mb: 2 }}>
                <motion.img
                  src={logo}
                  alt="Logo"
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

              {/* Title */}
              <h2 className="fw-bold mb-2">Verify Your Email</h2>

              <p className="text-muted mb-3">We sent a 6-digit code to:</p>

              <strong className="d-block mb-3">{email}</strong>

              {fallbackCode ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Email delivery failed. Use this code:{" "}
                  <strong>{fallbackCode}</strong>
                </Alert>
              ) : null}

              {/* Input */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  justifyContent: "center",
                }}
                onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputsRef.current[index] = el)}
                    value={digit}
                    onChange={(e) => handleChange(e.target.value, index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    maxLength={1}
                    style={{
                      width: "45px",
                      height: "50px",
                      textAlign: "center",
                      fontSize: "20px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      outline: "none",
                      fontWeight: "bold",
                    }}
                  />
                ))}
              </div>

              {/* Button */}
              <Button
                variant="contained"
                fullWidth
                onClick={handleVerify}
                disabled={loading}
                className="text-white sign-btn"
                sx={{
                  mt: 3,
                  py: 1.2,
                  borderRadius: 5,
                  fontWeight: 700,
                  textTransform: "none",
                }}>
                {loading ? "Verifying..." : "Verify Email"}
              </Button>

              <div style={{ marginTop: "15px", textAlign: "center" }}>
                {timeLeft > 0 ? (
                  <p style={{ color: "#888" }}>Resend code in {timeLeft}s</p>
                ) : (
                  <Button onClick={handleResend} variant="text">
                    Resend Code
                  </Button>
                )}
              </div>

              {/* Back to login */}
              <div className="text-center mt-3">
                <Link
                  to="/register"
                  className="text-decoration-none text-black fw-bold">
                  Back to Sign Up
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
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

export default VerifyEmail;
