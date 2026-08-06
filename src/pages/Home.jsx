import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Break from "../components/Break";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import Swal from "sweetalert2";
import Grow from "@mui/material/Grow";

const getOperationalDayKey = (date = new Date(), resetHour = 3) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});

  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) - resetHour,
    ),
  )
    .toISOString()
    .slice(0, 10);
};

function Home() {
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("");
  const [gender, setGender] = useState(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [hasShift, setHasShift] = useState(false);
  const [showCompletedMessage, setShowCompletedMessage] = useState(false);
  const [attendanceCompletedToday, setAttendanceCompletedToday] =
    useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState("Not Checked In");
  const [breakRefreshKey, setBreakRefreshKey] = useState(0);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [dayResetHour, setDayResetHour] = useState(3);
  const [workMode, setWorkMode] = useState(() => {
    if (typeof window === "undefined") return "office";

    const savedMode = window.localStorage.getItem("work_mode");
    const savedDay = window.localStorage.getItem("work_mode_day");
    const today = getOperationalDayKey();

    if (savedMode && savedDay === today) {
      return savedMode === "remote" ? "remote" : "office";
    }

    return "office";
  });
  const [initializedWorkMode, setInitializedWorkMode] = useState(true);
  const dayKeyRef = useRef("");
  const autoCheckoutTriggeredRef = useRef("");

  // The operational day changes at 03:00 Cairo time, not midnight.
  const getTodayKey = useCallback(
    () => getOperationalDayKey(new Date(), dayResetHour),
    [dayResetHour],
  );

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
    const hasOpenAttendance =
      !!latestAttendance && latestAttendance.check_out === null;

    if (!hasOpenAttendance) {
      autoCheckoutTriggeredRef.current = "";
    }

    setIsCheckedIn(hasOpenAttendance);
    setAttendanceStatus(
      !!latestAttendance && latestAttendance.check_out === null
        ? "Working"
        : !!latestAttendance && latestAttendance.check_out !== null
          ? "Completed"
          : "Not Checked In",
    );
    setAttendanceCompletedToday(
      !!latestAttendance && latestAttendance.check_out !== null,
    );
  }, [getTodayKey]);

  const performCheckout = useCallback(
    async (
      userId,
      source = "user",
      checkoutTime = null,
      workModeValue = null,
    ) => {
      const result = await supabase.functions.invoke("check-out", {
        body: {
          user_id: userId,
          source,
          checkout_time: checkoutTime,
          work_mode: workModeValue,
        },
      });

      if (result.error) {
        const text = await result.error.context?.text?.();
        throw new Error(text || result.error.message || "Checkout failed");
      }

      const data = result.data;
      if (!data?.success) {
        throw new Error(data?.message || "Checkout failed");
      }

      return data;
    },
    [],
  );

  const promptWorkModeSelection = async () => {
    const result = await Swal.fire({
      title: "Choose your work mode",
      text: "Select where you'll work today.",
      icon: "question",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Office",
      denyButtonText: "Remote",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#00a6eb",
      fontWeight: 700,
      denyButtonColor: "#0f766e",
      reverseButtons: true,
    });

    if (
      result.isDismissed ||
      (result.isDenied === false && result.isConfirmed === false)
    ) {
      return null;
    }

    return result.isConfirmed ? "office" : "remote";
  };

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

      if (!hasShift && role !== "admin") {
        Swal.fire({
          icon: "warning",
          title: "Shift Required",
          text: "You must be assigned a shift before checking in.",
        });
        return;
      }

      const wasCheckedIn = isCheckedIn; // حفظ الحالة قبل العملية

      if (attendanceCompletedToday && !isCheckedIn) {
        Swal.fire({
          icon: "info",
          title: "Already Completed",
          text: "Your attendance is already completed for today.",
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
      let selectedWorkMode = workMode;

      if (!isCheckedIn) {
        const chosenMode = await promptWorkModeSelection();

        if (chosenMode === null) {
          return;
        }

        selectedWorkMode = chosenMode;
        setWorkMode(chosenMode);
      }

      if (isCheckedIn) {
        await performCheckout(user.id, "user", null, selectedWorkMode);
      } else {
        const result = await supabase.functions.invoke(functionName, {
          body: {
            user_id: user.id,
            work_mode: selectedWorkMode,
          },
        });

        if (result.error) {
          const text = await result.error.context?.text?.();
          throw new Error(text || result.error.message || "Check-in failed");
        }

        if (!result.data?.success) {
          Swal.fire({
            icon: "error",
            title: "Error",
            text: result.data?.message,
          });
          return;
        }
      }

      Swal.fire({
        icon: "success",
        title: wasCheckedIn
          ? "Checked Out Successfully"
          : "Checked In Successfully",
        timer: 1500,
        showConfirmButton: false,
      });

      await checkAttendance();
      setBreakRefreshKey((p) => p + 1);

      if (wasCheckedIn) {
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
  }, [checkAttendance, getTodayKey, resetCompletedMessageState]);

  useEffect(() => {
    let isMounted = true;

    const runAutoCheckout = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id || !isCheckedIn || attendanceCompletedToday) return;

      const { data: openAttendance, error } = await supabase
        .from("attendance")
        .select("id, shift_start, shift_end")
        .eq("user_id", user.id)
        .is("check_out", null)
        .order("check_in", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !openAttendance?.shift_end) return;

      const shiftEndUtc = new Date(openAttendance.shift_end);
      if (Number.isNaN(shiftEndUtc.getTime())) return;

      const shiftStartUtc = openAttendance.shift_start
        ? new Date(openAttendance.shift_start)
        : shiftEndUtc;

      const now = new Date();

      // determine Cairo-local hours for shift start/end
      const fmtHour = (d) =>
        Number(
          new Intl.DateTimeFormat("en", {
            hour: "numeric",
            hour12: false,
            timeZone: "Africa/Cairo",
          }).format(d),
        );

      const shiftStartCairoHour = fmtHour(shiftStartUtc);
      const normalizedShiftEnd =
        shiftEndUtc <= shiftStartUtc
          ? new Date(shiftEndUtc.getTime() + 24 * 60 * 60 * 1000)
          : shiftEndUtc;
      // Employees are automatically checked out two hours after their shift
      // ends. The operational-day reset at 03:00 is handled separately.
      const autoCheckoutThreshold = new Date(
        normalizedShiftEnd.getTime() + 2 * 60 * 60 * 1000,
      );

      if (now < autoCheckoutThreshold) return;
      if (autoCheckoutTriggeredRef.current === openAttendance.id) return;

      autoCheckoutTriggeredRef.current = openAttendance.id;

      try {
        await performCheckout(
          user.id,
          "system",
          normalizedShiftEnd.toISOString(),
        );

        if (!isMounted) return;

        await checkAttendance();
        setBreakRefreshKey((prev) => prev + 1);

        Swal.fire({
          icon: "info",
          title: "Auto Check Out",
          text: "Your shift ended and you were checked out automatically by the system.",
          timer: 2500,
          showConfirmButton: false,
        });
      } catch (err) {
        console.error("Auto checkout failed", err);
      }
    };

    const interval = setInterval(() => {
      void runAutoCheckout();
    }, 60000);

    void runAutoCheckout();

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [attendanceCompletedToday, checkAttendance, isCheckedIn, performCheckout]);

  useEffect(() => {
    if (!showCompletedMessage) return;

    const timer = setTimeout(() => {
      setShowCompletedMessage(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [showCompletedMessage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("work_mode", workMode);
    window.localStorage.setItem("work_mode_day", getTodayKey());
  }, [getTodayKey, workMode]);

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
          .select("id, shifts(start_time, end_time)")
          .eq("user_id", user.id)
          .maybeSingle();

        if (shiftError) throw shiftError;

        setHasShift(!!shift);
        const assignedShift = shift?.shifts;
        setDayResetHour(
          assignedShift?.start_time?.startsWith("00:00") &&
            assignedShift?.end_time?.startsWith("08:00")
            ? 11
            : 3,
        );
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
  const dashboardSubText =
    !hasShift && role !== "admin"
      ? "Your dashboard is ready. Contact your administrator to get assigned to a shift."
      : attendanceCompletedToday
        ? "Your check-out has been recorded for today."
        : isCheckedIn
          ? "You're checked in for today. Manage your workday and break sessions from here."
          : "Start your workday by checking in, then manage your breaks throughout the day.";
  const attendanceTitle =
    attendanceStatus === "Working"
      ? "Have a productive day!"
      : attendanceStatus === "Completed"
        ? "Check-out recorded"
        : "Ready to start your day";
  const attendanceHelpText = attendanceCompletedToday
    ? "Your check-out has been registered for today."
    : isCheckedIn
      ? "Tap below to register your check-out for today."
      : "Tap below to register your check-in for today.";
  const attendanceChipLabel = attendanceCompletedToday
    ? "Checked Out"
    : isCheckedIn
      ? "Checked In"
      : "Not Checked In";
  const attendanceButtonText = attendanceCompletedToday
    ? "Checked Out"
    : isCheckedIn
      ? "Check Out"
      : "Check In";
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
                {dashboardSubText}
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
                    Check-out recorded
                  </Typography>

                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ mt: 1 }}>
                    Your check-out has been registered for today. Have a
                    wonderful day!
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
                          color:
                            attendanceStatus === "Working"
                              ? "#0f766e"
                              : "#334155",
                        }}>
                        {attendanceTitle}
                      </Typography>

                      <Typography
                        variant="overline"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}>
                        {attendanceHelpText}
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
                        label={attendanceChipLabel}
                        color={isCheckedIn ? "success" : "default"}
                        variant={isCheckedIn ? "filled" : "outlined"}
                      />

                      <Button
                        variant="contained"
                        color={isCheckedIn ? "error" : "success"}
                        onClick={handleAttendance}
                        disabled={
                          loadingAttendance ||
                          attendanceCompletedToday ||
                          (!hasShift && role !== "admin")
                        }
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
                        ) : (
                          attendanceButtonText
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
