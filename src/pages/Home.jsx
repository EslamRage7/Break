import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Break from "../components/Break";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import Swal from "sweetalert2";

function Home() {
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("");
  const [gender, setGender] = useState(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [showCompletedMessage, setShowCompletedMessage] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const dayKeyRef = useRef("");

  const getTodayKey = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(new Date());

  let displayName = "";

  if (firstName) {
    if (role === "admin") {
      displayName = gender ? `Mr. ${firstName}` : `Mrs. ${firstName}`;
    } else {
      displayName = gender ? `${firstName} 👋` : `${firstName} 🌸`;
    }
  }

  const checkAttendance = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const today = getTodayKey();

    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user.id)
      .gte("check_in", `${today}T00:00:00`)
      .lte("check_in", `${today}T23:59:59`)
      .is("check_out", null)
      .maybeSingle();

    const hasActiveAttendance = !!data;
    setIsCheckedIn(hasActiveAttendance);

    if (hasActiveAttendance) {
      setShowCompletedMessage(false);
    }
  }, []);

  const handleAttendance = async () => {
    try {
      setLoadingAttendance(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Swal.fire({
          icon: "error",
          title: "Login Required",
          text: "Please login first.",
        });
        return;
      }

      if (isCheckedIn) {
        const confirmResult = await Swal.fire({
          icon: "warning",
          title: "Confirm Check Out",
          text: "Are you sure you want to check out?",
          showCancelButton: true,
          confirmButtonText: "Yes, check out",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#d33",
        });

        if (!confirmResult.isConfirmed) {
          return;
        }
      }

      const functionName = isCheckedIn ? "check-out" : "check-in";

      const result = await supabase.functions.invoke(functionName, {
        body: {
          user_id: user.id,
        },
      });

      console.log("Function Result:", result);

      if (result.error) {
        console.log("Response:", result.error.context);

        const text = await result.error.context.text();
        console.log("Body:", text);

        throw new Error(text);
      }

      const data = result.data;

      if (!data.success) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: data.message,
        });
        return;
      }

      Swal.fire({
        icon: "success",
        title: isCheckedIn
          ? "Checked Out Successfully"
          : "Checked In Successfully",
        timer: 1500,
        showConfirmButton: false,
      });

      if (isCheckedIn) {
        setShowCompletedMessage(true);
      } else {
        setShowCompletedMessage(false);
      }

      await checkAttendance();
    } catch (err) {
      console.error(err);

      Swal.fire({
        icon: "error",
        title: "Oops...",
        text: err.message,
      });
    } finally {
      setLoadingAttendance(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      dayKeyRef.current = getTodayKey();
      await checkAttendance();
    };

    init();
  }, [checkAttendance]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const currentDay = getTodayKey();

      if (currentDay !== dayKeyRef.current) {
        dayKeyRef.current = currentDay;
        setShowCompletedMessage(false);
        setIsCheckedIn(false);
        await checkAttendance();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [checkAttendance]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data, error } = await supabase
          .from("employees")
          .select("first_name, role, gender")
          .eq("user_id", user.id)
          .single();

        if (error) throw error;
        if (data) {
          setFirstName(data.first_name || "");
          setRole(data.role || "");
          setGender(data.gender);
        }
      } catch (err) {
        console.error(err);
      }
    };

    loadUser();
  }, []);

  const navigate = useNavigate();

  return (
    <>
      <div className="dashboard-layout">
        <Sidebar />

        <section className="dashboard-content">
          <div className="settings-panel">
            <div className="settings-header text-capitalize">
              <h1>Welcome{displayName ? `, ${displayName}` : ""} </h1>
            </div>

            {showCompletedMessage ? (
              <Box
                sx={{
                  mt: 2,
                  mb: 3,
                  p: { xs: 2.2, sm: 3 },
                  borderRadius: 3,
                  border: "1px solid #e5e7eb",
                  background:
                    "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(255,255,255,1) 100%)",
                  textAlign: "center",
                }}>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, color: "#0f766e" }}>
                  Work completed
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ mt: 1 }}>
                  You’ve finished your work for today. Have a wonderful day!
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  mt: 2,
                  mb: 3,
                  p: { xs: 2.2, sm: 3 },
                  borderRadius: 3,
                  border: "1px solid #e5e7eb",
                  background:
                    "linear-gradient(135deg, rgba(14,165,233,0.08) 0%, rgba(255,255,255,1) 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  flexWrap: "wrap",
                }}>
                <Box>
                  <Typography
                    variant="body2"
                    className="fw-bold"
                    sx={{ color: "text.secondary", letterSpacing: 1.2 }}>
                    Attendance
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: isCheckedIn ? "#0f766e" : "#334155",
                    }}>
                    {isCheckedIn
                      ? "You are checked in today"
                      : "Ready to start your day"}
                  </Typography>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}>
                    {isCheckedIn
                      ? "Tap below when you finish work to check out."
                      : "Tap below to register your check-in for today."}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    flexWrap: "wrap",
                  }}>
                  <Chip
                    label={isCheckedIn ? "Checked In" : "Not Checked In"}
                    color={isCheckedIn ? "success" : "default"}
                    variant={isCheckedIn ? "filled" : "outlined"}
                  />
                  <Button
                    variant="contained"
                    color={isCheckedIn ? "error" : "success"}
                    onClick={handleAttendance}
                    disabled={loadingAttendance}
                    sx={{
                      minWidth: 140,
                      px: 2.5,
                      py: 1.1,
                      borderRadius: 2,
                      fontWeight: 700,
                      textTransform: "none",
                    }}>
                    {loadingAttendance ? (
                      <CircularProgress size={22} color="inherit" />
                    ) : isCheckedIn ? (
                      "Check Out"
                    ) : (
                      "Check In"
                    )}
                  </Button>
                </Box>
              </Box>
            )}

            <Break />

            {!firstName && (
              <div className="home-cta">
                <button
                  className="timer-button primary"
                  onClick={() => navigate("/login")}>
                  تسجيل دخول
                </button>

                <button
                  className="timer-button secondary"
                  onClick={() => navigate("/register")}>
                  تسجيل حساب
                </button>
              </div>
            )}
          </div>
          <Footer />
        </section>
      </div>
    </>
  );
}

export default Home;
