import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const BREAK_LIMIT = 45;
const BREAK_DURATION_SECONDS = BREAK_LIMIT * 60;

const formatTime = (minutesLeft, secondsLeft) => {
  return `${String(minutesLeft).padStart(2, "0")}:${String(
    secondsLeft,
  ).padStart(2, "0")}`;
};

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

const getElapsedSeconds = (session, now = Date.now()) => {
  if (!session) return 0;

  if (session.status === "completed" || session.is_paused) {
    return Number(session.used_seconds || 0);
  }

  const startedAt = new Date(session.start_time).getTime();
  if (Number.isNaN(startedAt)) return Number(session.used_seconds || 0);

  return Math.max(0, Math.floor((now - startedAt) / 1000));
};

const getRemainingSeconds = (session, now = Date.now()) => {
  if (!session) return 0;

  const duration = Number(session.duration_seconds || BREAK_DURATION_SECONDS);
  const elapsed = getElapsedSeconds(session, now);

  return Math.max(0, duration - elapsed);
};

export default function Break({
  attendanceCompletedToday = false,
  refreshKey = 0,
}) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [minutes, setMinutes] = useState(BREAK_LIMIT);
  const [seconds, setSeconds] = useState(0);

  const [running, setRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [usedToday, setUsedToday] = useState(0);
  const [remainingBreak, setRemainingBreak] = useState(BREAK_LIMIT);
  const isPaused = session?.is_paused;
  const dayKeyRef = useRef("");

  const totalDurationSeconds = BREAK_DURATION_SECONDS;
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
        data: { user: authUser },
      } = await supabase.auth.getUser();

      setUser(authUser);
    };

    void loadUser();
  }, []);

  const loadTodayUsage = useCallback(async (userId) => {
    if (!userId) return 0;

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
        totalSeconds += Number(item.used_seconds || 0);
        return;
      }

      if (item.is_paused) {
        totalSeconds += Number(item.used_seconds || 0);
        return;
      }

      const elapsed = getElapsedSeconds(item);
      totalSeconds += Math.min(
        elapsed,
        Number(item.duration_seconds || BREAK_DURATION_SECONDS),
      );
    });

    const totalMinutes = Math.floor(totalSeconds / 60);
    const reachedLimit = totalMinutes >= BREAK_LIMIT;

    setUsedToday(totalMinutes);
    setRemainingBreak(Math.max(0, BREAK_LIMIT - totalMinutes));
    setIsDisabled(reachedLimit);

    return totalMinutes;
  }, []);

  const completeSession = useCallback(async (sessionId) => {
    if (!sessionId) return;

    try {
      await supabase
        .from("break_sessions")
        .update({
          status: "completed",
          used_seconds: BREAK_DURATION_SECONDS,
          used_minutes: BREAK_LIMIT,
          end_time: new Date().toISOString(),
        })
        .eq("id", sessionId);
    } catch (err) {
      console.error("Failed to complete session", err);
    }
  }, []);

  const loadLastSession = useCallback(async (userId) => {
    if (!userId) return null;

    const { data } = await supabase
      .from("break_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("start_time", { ascending: false });

    const todaysSessions = (data || []).filter((item) =>
      isWithinToday(item.start_time),
    );

    return todaysSessions[0] || null;
  }, []);

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
        Math.min(
          BREAK_DURATION_SECONDS,
          usedSecondsValue ?? BREAK_DURATION_SECONDS,
        ),
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
    [],
  );

  const completeBreakFlow = useCallback(
    async (
      sessionId = null,
      activeSession = session,
      usedSecondsValue = null,
    ) => {
      const resolvedSessionId = sessionId ?? activeSession?.id;
      const resolvedUsedSeconds = Math.max(
        0,
        Math.min(
          Number(activeSession?.duration_seconds || BREAK_DURATION_SECONDS),
          usedSecondsValue ?? getElapsedSeconds(activeSession),
        ),
      );

      setRunning(false);
      setIsFinished(true);
      setIsDisabled(true);
      setMinutes(0);
      setSeconds(0);
      setRemainingBreak(0);
      setSession(null);

      if (activeSession?.id && user?.id) {
        await supabase.from("break_segments").insert({
          break_session_id: resolvedSessionId,
          user_id: user.id,
          start_time: activeSession.start_time,
          end_time: new Date().toISOString(),
          duration_seconds: Math.max(
            0,
            resolvedUsedSeconds - (activeSession.used_seconds || 0),
          ),
        });
      }

      if (resolvedSessionId) {
        await finalizeBreakSession(
          resolvedSessionId,
          new Date().toISOString(),
          resolvedUsedSeconds,
        );
      }

      if (user?.id) {
        await loadTodayUsage(user.id);
      }
    },
    [finalizeBreakSession, loadTodayUsage, session, user?.id],
  );

  useEffect(() => {
    if (!user?.id) return;

    let isActive = true;

    const updateTimer = async () => {
      const latest = await loadLastSession(user.id);
      if (!isActive) return;

      if (!latest || latest.status === "completed") {
        return;
      }

      const remaining = getRemainingSeconds(latest);

      if (remaining <= 0) {
        await completeBreakFlow(
          latest.id,
          latest,
          latest.duration_seconds || BREAK_DURATION_SECONDS,
        );
        return;
      }

      setSession(latest);
      setRunning(!latest.is_paused);
      setMinutes(Math.floor(remaining / 60));
      setSeconds(remaining % 60);
    };

    void updateTimer();
    const interval = window.setInterval(() => {
      void updateTimer();
    }, 1000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [completeBreakFlow, loadLastSession, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const init = async () => {
      const latest = await loadLastSession(user.id);
      await loadTodayUsage(user.id);

      if (!latest) {
        setIsFinished(false);
        setIsDisabled(false);
        setMinutes(BREAK_LIMIT);
        setSeconds(0);
        setSession(null);
        return;
      }

      if (
        latest.status === "completed" ||
        (latest.used_seconds || 0) >=
          (latest.duration_seconds || BREAK_DURATION_SECONDS)
      ) {
        if (latest.status !== "completed") {
          await completeSession(latest.id);
        }

        setSession(null);
        setRunning(false);
        setIsFinished(true);
        setIsDisabled(true);
        setMinutes(0);
        setSeconds(0);
        return;
      }

      const remaining = getRemainingSeconds(latest);

      if (remaining <= 0) {
        await completeSession(latest.id);
        setSession(null);
        setRunning(false);
        setIsFinished(false);
        setIsDisabled(false);
        setMinutes(BREAK_LIMIT);
        setSeconds(0);
        return;
      }

      setSession(latest);
      setRunning(!latest.is_paused);
      setMinutes(Math.floor(remaining / 60));
      setSeconds(remaining % 60);
      setIsFinished(false);
      setIsDisabled(false);
    };

    void init();
  }, [completeSession, loadLastSession, loadTodayUsage, user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentDay = getTodayKey();

      if (currentDay !== dayKeyRef.current) {
        dayKeyRef.current = currentDay;
        resetForNewDay();
      }
    }, 60000);

    return () => window.clearInterval(interval);
  }, [resetForNewDay]);

  useEffect(() => {
    const init = async () => {
      await loadTodayUsage(user?.id);
    };

    if (user?.id) {
      void init();
    }
  }, [loadTodayUsage, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (attendanceCompletedToday) return;

    void loadTodayUsage(user.id);
  }, [attendanceCompletedToday, refreshKey, loadTodayUsage, user?.id]);

  const startBreak = async (force = false) => {
    if (!user) return;

    const todayUsage = await loadTodayUsage(user.id);
    if (todayUsage >= BREAK_LIMIT && !force) {
      setIsDisabled(true);
      return;
    }

    setIsFinished(false);

    const { data, error } = await supabase
      .from("break_sessions")
      .insert([
        {
          user_id: user.id,
          start_time: new Date().toISOString(),
          duration_seconds: BREAK_DURATION_SECONDS,
          duration_minutes: BREAK_LIMIT,
          used_seconds: 0,
          used_minutes: 0,
          status: "active",
          is_paused: false,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Failed to start break", error);
      return;
    }

    setSession(data);
    setRunning(true);
    setMinutes(BREAK_LIMIT);
    setSeconds(0);
    setIsDisabled(false);
    await loadTodayUsage(user.id);
  };

  const pauseBreak = async () => {
    if (!session || isDisabled) return;

    const remainingSeconds = minutes * 60 + seconds;
    const usedSeconds = Math.max(0, BREAK_DURATION_SECONDS - remainingSeconds);

    setRunning(false);

    await supabase.from("break_segments").insert({
      break_session_id: session.id,
      user_id: user.id,
      start_time: session.start_time,
      end_time: new Date().toISOString(),
      duration_seconds: Math.max(0, usedSeconds - (session.used_seconds || 0)),
    });

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

    const elapsedSeconds = session.used_seconds || 0;
    const newStart = new Date(Date.now() - elapsedSeconds * 1000).toISOString();

    await supabase
      .from("break_sessions")
      .update({
        is_paused: false,
        paused_at: null,
        start_time: newStart,
      })
      .eq("id", session.id);

    setSession((prev) => ({
      ...prev,
      is_paused: false,
      start_time: newStart,
    }));

    setRunning(true);
    await loadTodayUsage(user.id);
  };

  const finishBreak = async () => {
    await completeBreakFlow(session?.id);
  };

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
