import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const BREAK_LIMIT = 45; // minutes

const formatTime = (minutesLeft, secondsLeft) => {
  return `${String(minutesLeft).padStart(2, "0")}:${String(
    secondsLeft,
  ).padStart(2, "0")}`;
};

export default function Break({
  attendanceCompletedToday = false,
  refreshKey = 0,
}) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [minutes, setMinutes] = useState(45);
  const [seconds, setSeconds] = useState(0);

  const [running, setRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  const [usedToday, setUsedToday] = useState(0);
  const [remainingBreak, setRemainingBreak] = useState(BREAK_LIMIT);
  const isPaused = session?.is_paused;
  const intervalRef = useRef(null);
  const syncCounterRef = useRef(0);
  const dayKeyRef = useRef("");

  const getTodayKey = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(new Date());

  const isWithinToday = (value) => {
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    const sessionDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(date);

    return sessionDay === getTodayKey();
  };

  const totalDurationSeconds = BREAK_LIMIT * 60;
  const getSessionElapsedSeconds = useCallback((item) => {
    if (!item) return 0;

    const sessionLimit = Number(item.duration_seconds) || totalDurationSeconds;
    const baseSeconds = Math.max(0, Number(item.used_seconds) || 0);
    if (item.is_paused || !item.start_time) {
      return Math.min(baseSeconds, sessionLimit);
    }

    const sinceStartSeconds = Math.floor(
      (Date.now() - new Date(item.start_time).getTime()) / 1000,
    );

    return Math.min(
      sessionLimit,
      Math.max(0, baseSeconds + (Number.isFinite(sinceStartSeconds) ? sinceStartSeconds : 0)),
    );
  }, [totalDurationSeconds]);
  const showFinishedState =
    isFinished || (!running && minutes === 0 && seconds === 0 && !session);
  const progressPercent = showFinishedState
    ? 0
    : Math.min(
        100,
        Math.max(0, ((minutes * 60 + seconds) / totalDurationSeconds) * 100),
      );
  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);
    };

    loadUser();
  }, []);

  const loadTodayUsage = useCallback(async (userId) => {
    const today = getTodayKey();

    const { data } = await supabase
      .from("break_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("start_time", { ascending: false });

    const todaysSessions = (data || []).filter((item) =>
      isWithinToday(item.start_time),
    );
    let totalSeconds = 0;

    todaysSessions.forEach((item) => {
      if (item.status === "completed") {
        totalSeconds += Math.max(0, Number(item.used_seconds) || 0);
        return;
      }

      if (item.is_paused) {
        totalSeconds += Math.max(0, Number(item.used_seconds) || 0);
        return;
      }

      const elapsed = getSessionElapsedSeconds(item);

      totalSeconds += elapsed;
    });

    // The daily allowance is 45 minutes, even if old data contains an
    // incorrectly large duration.
    totalSeconds = Math.min(totalSeconds, totalDurationSeconds);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const reachedLimit = totalMinutes >= BREAK_LIMIT;

    setUsedToday(totalMinutes);
    setRemainingBreak(Math.max(0, BREAK_LIMIT - totalMinutes));
    setIsDisabled(reachedLimit);

    return totalMinutes;
  }, [getSessionElapsedSeconds, totalDurationSeconds]);

  const completeSession = async (sessionId) => {
    try {
      await supabase
        .from("break_sessions")
        .update({
          status: "completed",
          used_seconds: 2700,
          used_minutes: 45,
          end_time: new Date().toISOString(),
        })
        .eq("id", sessionId);
    } catch (err) {
      console.error("Failed to complete session", err);
    }
  };

  const loadLastSession = useCallback(async (userId) => {
    const today = getTodayKey();

    const { data } = await supabase
      .from("break_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("start_time", { ascending: false });

    const todaysSessions = (data || []).filter((item) =>
      isWithinToday(item.start_time),
    );

    // لو فيه Active رجعه
    const activeSession = todaysSessions.find((s) => s.status === "active");

    if (activeSession) return activeSession;

    // غير كده رجع آخر Session
    return todaysSessions[0] || null;
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(async () => {
      const last = await loadLastSession(user.id);

      if (!last || last.status === "completed") return;

      const elapsed = getSessionElapsedSeconds(last);

      const remaining = Math.max(last.duration_seconds - elapsed, 0);

      setMinutes(Math.floor(remaining / 60));
      setSeconds(remaining % 60);

      setSession(last);
      setRunning(!last.is_paused);
    }, 1000);

    return () => clearInterval(interval);
  }, [user?.id, loadLastSession]);
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      const last = await loadLastSession(user.id);

      await loadTodayUsage(user.id);

      if (!last) {
        setIsFinished(false);
        setIsDisabled(false);
        return;
      }

      if (last.status === "completed" || last.used_seconds >= 2700) {
        if (last.status !== "completed") {
          await completeSession(last.id);
        }

        setSession(null);
        setRunning(false);
        setIsFinished(true);
        setIsDisabled(true);

        setMinutes(0);
        setSeconds(0);
        setRemainingBreak(0);

        return;
      }
      const elapsed = getSessionElapsedSeconds(last);

      const remaining = Math.max(last.duration_seconds - elapsed, 0);

      if (remaining <= 0) {
        await completeSession(last.id);
        setSession(null);
        setRunning(false);
        setIsFinished(false);
        setIsDisabled(false);
        setMinutes(BREAK_LIMIT);
        setSeconds(0);
        return;
      }

      setSession(last);
      setMinutes(Math.floor(remaining / 60));
      setSeconds(remaining % 60);

      setRunning(!last.is_paused);
    };

    init();
  }, [user, loadLastSession, loadTodayUsage]);
  const resetForNewDay = useCallback(() => {
    setSession(null);
    setRunning(false);
    setIsFinished(false);
    setIsDisabled(false);
    setMinutes(BREAK_LIMIT);
    setSeconds(0);
    setUsedToday(0);
    setRemainingBreak(BREAK_LIMIT);
  }, []);

  const finalizeBreakSession = useCallback(
    async (
      sessionId,
      endTime = new Date().toISOString(),
      usedSecondsValue = null,
    ) => {
      if (!sessionId) return;

      const resolvedUsedSeconds = Math.max(
        0,
        Math.min(2700, usedSecondsValue ?? 2700 - (minutes * 60 + seconds)),
      );

      try {
        await supabase
          .from("break_sessions")
          .update({
            status: "completed",
            used_seconds: resolvedUsedSeconds,
            used_minutes: Math.floor(resolvedUsedSeconds / 60),
            end_time: endTime,
          })
          .eq("id", sessionId);
      } catch (err) {
        console.error("Failed to finalize break session", err);
      }
    },
    [minutes, seconds],
  );

  const finalizeActiveBreakSegment = useCallback(
    async (
      sessionId,
      endTime = new Date().toISOString(),
      usedSecondsValue = null,
    ) => {
      if (!sessionId) return;

      const resolvedUsedSeconds = Math.max(
        0,
        Math.min(2700, usedSecondsValue ?? 2700 - (minutes * 60 + seconds)),
      );

      try {
        await supabase
          .from("break_segments")
          .update({
            end_time: endTime,
            duration_seconds: Math.max(
              0,
              resolvedUsedSeconds - (session?.used_seconds || 0),
            ),
          })
          .eq("break_session_id", sessionId)
          .is("end_time", null);
      } catch (err) {
        console.error("Failed to finalize break segment", err);
      }
    },
    [minutes, seconds, session],
  );

  const completeBreakFlow = useCallback(
    async (sessionId = null) => {
      const resolvedSessionId = sessionId ?? session?.id;

      setRunning(false);
      setIsFinished(true);
      setIsDisabled(true);
      setMinutes(0);
      setSeconds(0);
      setRemainingBreak(0);
      setSession(null);

      if (resolvedSessionId) {
        await finalizeBreakSession(resolvedSessionId);
        await finalizeActiveBreakSegment(resolvedSessionId);
      }
    },
    [finalizeBreakSession, finalizeActiveBreakSegment, session?.id],
  );

  const startBreak = async (force = false) => {
    console.log("START CLICKED");
    if (!user) return;
    const todayUsage = await loadTodayUsage(user.id);

    if (todayUsage >= BREAK_LIMIT) {
      setIsDisabled(true);
      return;
    }

    clearInterval(intervalRef.current);
    setIsFinished(false);

    const used = await loadTodayUsage(user.id);

    if (!force && used >= BREAK_LIMIT) {
      setIsDisabled(true);
      return;
    }
    const active = await loadLastSession(user.id);

    if (active && active.status === "active") {
      setSession(active);
      return;
    }
    const { data } = await supabase
      .from("break_sessions")
      .insert([
        {
          user_id: user.id,
          start_time: new Date().toISOString(),
          duration_seconds: 2700,
          duration_minutes: 45,
          used_seconds: 0,
          used_minutes: 0,
          status: "active",
          is_paused: false,
        },
      ])
      .select()
      .single();
    console.log("NEW SESSION", data);
    setSession(data);
    await supabase.from("break_segments").insert({
      break_session_id: data.id,
      user_id: user.id,
      start_time: new Date().toISOString(),
    });
    setMinutes(45);
    setSeconds(0);
    setRunning(true);
    console.log("New Break Session:", data);
    await loadTodayUsage(user.id);
  };

  const pauseBreak = async () => {
    if (!session || isDisabled) return;

    clearInterval(intervalRef.current);
    setRunning(false);

    const usedSeconds = 2700 - (minutes * 60 + seconds);
    await supabase
      .from("break_segments")
      .update({
        end_time: new Date().toISOString(),
        duration_seconds: usedSeconds - (session.used_seconds || 0),
      })
      .eq("break_session_id", session.id)
      .is("end_time", null);

    await supabase
      .from("break_sessions")
      .update({
        is_paused: true,
        paused_at: new Date().toISOString(),
        used_seconds: usedSeconds,
        used_minutes: Math.floor(usedSeconds / 60),
      })
      .eq("id", session.id);
    setSession((prev) => ({
      ...prev,
      is_paused: true,
      used_seconds: usedSeconds,
      used_minutes: Math.floor(usedSeconds / 60),
    }));
    await loadTodayUsage(user.id);
  };

  const resumeBreak = async () => {
    if (!session) return;

    const used = await loadTodayUsage(user.id);

    if (used >= BREAK_LIMIT) return;

    const newStart = new Date().toISOString();

    await supabase
      .from("break_sessions")
      .update({
        is_paused: false,
        paused_at: null,
        start_time: newStart,
      })
      .eq("id", session.id);
    await supabase.from("break_segments").insert({
      break_session_id: session.id,
      user_id: user.id,
      start_time: new Date().toISOString(),
    });
    setSession((prev) => ({
      ...prev,
      is_paused: false,
      start_time: newStart,
    }));

    setRunning(true);

    await loadTodayUsage(user.id);
  };
  useEffect(() => {
    if (!session) return;

    const remaining = minutes * 60 + seconds;

    if (remaining <= 0 && running && session.status !== "completed") {
      const finalize = async () => {
        clearInterval(intervalRef.current);
        await completeBreakFlow(session.id);
        await loadTodayUsage(user.id);
      };

      finalize();
    }
  }, [minutes, seconds, running, session, user, loadTodayUsage]);

  const finishBreak = async () => {
    await completeBreakFlow(session.id);

    if (user?.id) {
      await loadTodayUsage(user.id);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const currentDay = getTodayKey();

      if (currentDay !== dayKeyRef.current) {
        dayKeyRef.current = currentDay;
        resetForNewDay();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [resetForNewDay]);

  useEffect(() => {
    const init = async () => {
      dayKeyRef.current = getTodayKey();
      await loadTodayUsage(user?.id);
    };

    if (user?.id) {
      init();
    }
  }, [user?.id, loadTodayUsage]);

  useEffect(() => {
    if (!user?.id) return;

    if (attendanceCompletedToday) return;

    void loadTodayUsage(user.id);
  }, [attendanceCompletedToday, refreshKey, user?.id, loadTodayUsage]);

  const shouldHideBreak = attendanceCompletedToday || (!user && !session);

  if (shouldHideBreak) {
    return null;
  }

  return (
    <div className="break-timer m-auto">
      <div className="break-timer-header">
        <div>
          <h2>Break Timer</h2>
          <p>
            {running
              ? "Break is running"
              : isFinished
                ? "Your break is over. Hope you're feeling refreshed!"
                : isPaused
                  ? "Break paused"
                  : "Enjoy Your Break"}
          </p>
        </div>

        <span className={`timer-status ${running ? "active" : ""}`}>
          {running
            ? "Active"
            : isFinished
              ? "Finished"
              : isPaused
                ? "Paused"
                : "Standby"}
        </span>
      </div>

      <div className="timer-display">
        <span>{formatTime(minutes, seconds)}</span>
        <small>remaining</small>
      </div>

      <div
        className="timer-progress"
        aria-label={`${Math.round(progressPercent)}% remaining`}>
        <span
          style={{
            width: showFinishedState ? "0%" : `${progressPercent}%`,
          }}
        />
      </div>

      <div className="timer-stats">
        <div>
          <span>Daily Limit</span>
          <strong>45 min</strong>
        </div>

        <div>
          <span>Used Today</span>
          <strong>{usedToday} min</strong>
        </div>

        <div>
          <span>Remaining</span>
          <strong>{remainingBreak} min</strong>
        </div>
      </div>

      <div className="prayer-reminder">Don't forget your prayer 🙏🏻</div>

      <div className="timer-actions">
        {showFinishedState ? (
          <div className="timer-finished">Finished</div>
        ) : (
          <>
            {!session && !isFinished && (
              <>
                {isDisabled ? (
                  <div className="timer-finished">
                    Daily break limit reached today
                  </div>
                ) : (
                  <button className="timer-button primary" onClick={startBreak}>
                    Start
                  </button>
                )}
              </>
            )}

            {session?.is_paused && (
              <button className="timer-button primary" onClick={resumeBreak}>
                Resume
              </button>
            )}

            {running && (
              <button className="timer-button secondary" onClick={pauseBreak}>
                Pause
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
