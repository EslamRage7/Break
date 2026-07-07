import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Break from "../components/Break";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import Swal from "sweetalert2";
import Grow from "@mui/material/Grow";

function Home() {
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("");
  const [gender, setGender] = useState(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [hasShift, setHasShift] = useState(false);
  const [showCompletedMessage, setShowCompletedMessage] = useState(false);
  const [attendanceCompletedToday, setAttendanceCompletedToday] =
    useState(false);
  const [breakRefreshKey, setBreakRefreshKey] = useState(0);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const dayKeyRef = useRef("");

  const getTodayKey = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(new Date());

  const resetCompletedMessageState = useCallback(() => {
    setShowCompletedMessage(false);
  }, []);

  let displayName = "";

  if (firstName) {
    if (role === "admin") {
      displayName = gender ? `Mr. ${firstName}` : `Mrs. ${firstName}`;
    } else {
      displayName = gender ? `${firstName} 😎 ` : `${firstName} 🌸`;
    }
  }

  const checkAttendance = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const today = getTodayKey();

    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user.id)
      .eq("attendance_date", today)
      .order("check_in", { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      return;
    }

    const latestAttendance = data?.[0] ?? null;

    setIsCheckedIn(!!latestAttendance && latestAttendance.check_out === null);

    setAttendanceCompletedToday(
      !!latestAttendance && latestAttendance.check_out !== null,
    );
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

      await checkAttendance();
      setBreakRefreshKey((p) => p + 1);

      if (isCheckedIn) {
        setShowCompletedMessage(true);
      }
    } catch (err) {
      console.error(err);

      Swal.fire({
        icon: "info",

        text: "You have already checked in today",
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
        setIsCheckedIn(false);
        resetCompletedMessageState();
        await checkAttendance();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [checkAttendance, resetCompletedMessageState]);

  useEffect(() => {
    if (!showCompletedMessage) return;

    const timer = setTimeout(() => {
      setShowCompletedMessage(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [showCompletedMessage]);
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
        const { data: shift, error: shiftError } = await supabase
          .from("employee_shifts")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (shiftError) throw shiftError;

        setHasShift(!!shift);
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
  console.log({
    isCheckedIn,
    attendanceCompletedToday,
    hasShift,
    role,
    loadingAttendance,
  });
  return (
    <>
      <div className="dashboard-layout">
        <Sidebar />

        <section className="dashboard-content">
          <div className="settings-panel">
            <div className="settings-header text-capitalize">
              <Typography
                variant="h4"
                sx={{ fontWeight: 800, color: "#0f172a" }}>
                Welcome{displayName ? `, ${displayName}` : ""}
              </Typography>

              <Typography variant="body2" sx={{ mt: 0.5, color: "#64748b" }}>
                {!hasShift && role !== "admin"
                  ? "Your dashboard is ready. Contact your administrator to get assigned to a shift."
                  : attendanceCompletedToday
                    ? "Your workday has been completed successfully. We look forward to seeing you again tomorrow."
                    : isCheckedIn
                      ? "You're checked in for today. Manage your workday and break sessions from here."
                      : "Start your workday by checking in, then manage your breaks throughout the day."}
              </Typography>
            </div>
            {showCompletedMessage ? (
              <Grow
                in={showCompletedMessage}
                timeout={{ enter: 500, exit: 500 }}>
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
              </Grow>
            ) : hasShift || role === "admin" ? (
              <Grow in timeout={{ enter: 500, exit: 500 }}>
                <Box
                  className="position-relative"
                  sx={{
                    mt: 2,
                    mb: 3,
                    p: { xs: 2.2, sm: 3 },
                    borderRadius: 3,
                    border: "1px solid #e5e7eb",
                    gap: 2,
                  }}>
                  <Box
                    className="position-relative"
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
                        className="attendance-chip"
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
                </Box>
              </Grow>
            ) : (
              <Grow in timeout={{ enter: 500, exit: 500 }}>
                <Box
                  sx={{
                    mt: 2,
                    mb: 3,
                    p: 3,
                    borderRadius: 3,
                    border: "1px solid #e5e7eb",
                    textAlign: "center",
                  }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    No Shift Assigned
                  </Typography>

                  <Typography color="text.secondary">
                    You don't have an assigned shift yet. Please contact your
                    administrator.
                  </Typography>
                </Box>
              </Grow>
            )}

            {isCheckedIn && (
              <Break
                attendanceCompletedToday={attendanceCompletedToday}
                refreshKey={breakRefreshKey}
              />
            )}
          </div>

          <Footer />
        </section>
      </div>
    </>
  );
}

export default Home;
