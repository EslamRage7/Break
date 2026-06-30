import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const BREAK_LIMIT = 45; // minutes

const formatTime = (minutesLeft, secondsLeft) => {
  return `${String(minutesLeft).padStart(2, "0")}:${String(
    secondsLeft,
  ).padStart(2, "0")}`;
};

export default function Break() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  const [minutes, setMinutes] = useState(45);
  const [seconds, setSeconds] = useState(0);

  const [running, setRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const [usedToday, setUsedToday] = useState(0);
  const [remainingBreak, setRemainingBreak] = useState(BREAK_LIMIT);
  const isPaused = session?.is_paused;
  const intervalRef = useRef(null);
  const syncCounterRef = useRef(0);

  const totalDurationSeconds = BREAK_LIMIT * 60;
  const progressPercent = Math.min(
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
    const today = new Date().toISOString().split("T")[0];

    const { data } = await supabase
      .from("break_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("start_time", `${today}T00:00:00`)
      .lt("start_time", `${today}T23:59:59`);

    let totalSeconds = 0;

    data?.forEach((item) => {
      if (item.status === "completed") {
        totalSeconds += item.duration_seconds;
        return;
      }

      if (item.is_paused) {
        totalSeconds += item.used_seconds || 0;
        return;
      }

      const elapsed = Math.floor(
        (Date.now() - new Date(item.start_time).getTime()) / 1000,
      );

      totalSeconds += Math.min(elapsed, item.duration_seconds);
    });

    const totalMinutes = Math.floor(totalSeconds / 60);

    setUsedToday(totalMinutes);
    setRemainingBreak(Math.max(0, 45 - totalMinutes));

    return totalMinutes;
  }, []);

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

  const loadLastSession = async (userId) => {
    const { data } = await supabase
      .from("break_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data;
  };
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      const last = await loadLastSession(user.id);

      await loadTodayUsage(user.id);

      if (!last) return;

      if (last.status === "completed" || last.used_seconds >= 2700) {
        if (last.status !== "completed") {
          await completeSession(last.id);
        }

        setSession(null);
        setRunning(false);
        setIsFinished(false);
        setMinutes(BREAK_LIMIT);
        setSeconds(0);
        return;
      }

      const elapsed = last.is_paused
        ? last.used_seconds
        : Math.floor((Date.now() - new Date(last.start_time).getTime()) / 1000);

      const remaining = Math.max(last.duration_seconds - elapsed, 0);

      if (remaining <= 0) {
        await completeSession(last.id);
        setSession(null);
        setRunning(false);
        setIsFinished(false);
        setMinutes(BREAK_LIMIT);
        setSeconds(0);
        return;
      }

      setSession(last);
      setMinutes(Math.floor(remaining / 60));
      setSeconds(remaining % 60);

      const usedSeconds = 2700 - remaining;

      setUsedToday(Math.floor(usedSeconds / 60));
      setRemainingBreak(45 - Math.floor(usedSeconds / 60));
      setRunning(!last.is_paused);
    };

    init();
  }, [user, loadTodayUsage]);
  const startBreak = async (force = false) => {
    if (!user) return;

    clearInterval(intervalRef.current);
    setIsFinished(false);

    const used = await loadTodayUsage(user.id);

    if (!force && used >= 45) {
      alert("Daily limit reached");
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

    setSession(data);
    setMinutes(45);
    setSeconds(0);
    setRunning(true);

    await loadTodayUsage(user.id);
  };

  const pauseBreak = async () => {
    if (!session) return;

    clearInterval(intervalRef.current);
    setRunning(false);

    const usedSeconds = 2700 - (minutes * 60 + seconds);
    syncCounterRef.current = 0;
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
    setRunning(false);
  };

  const resumeBreak = async () => {
    if (!session) return;

    const used = await loadTodayUsage(user.id);

    if (used >= 45) {
      alert("Daily limit reached");
      return;
    }

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
    syncCounterRef.current = 0;
    setRunning(true);
    await loadTodayUsage(user.id);
    setIsFinished(false);
  };

  useEffect(() => {
    if (!running || !session) return;

    intervalRef.current = setInterval(async () => {
      const remaining = minutes * 60 + seconds;

      if (remaining <= 0) return;

      const newRemaining = remaining - 1;

      setMinutes(Math.floor(newRemaining / 60));
      setSeconds(newRemaining % 60);

      syncCounterRef.current++;

      if (syncCounterRef.current >= 10) {
        syncCounterRef.current = 0;

        const usedSeconds = 2700 - newRemaining;

        await supabase
          .from("break_sessions")
          .update({
            used_seconds: usedSeconds,
            used_minutes: Math.floor(usedSeconds / 60),
          })
          .eq("id", session.id);
      }
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [running, session, minutes, seconds]);

  useEffect(() => {
    if (!session) return;

    const remaining = minutes * 60 + seconds;

    if (remaining <= 0 && running && session.status !== "completed") {
      clearInterval(intervalRef.current);
      setRunning(false);
      setIsFinished(true);
      setMinutes(0);
      setSeconds(0);
      setSession(null);

      supabase
        .from("break_sessions")
        .update({
          status: "completed",
          used_seconds: 2700,
          used_minutes: 45,
          end_time: new Date().toISOString(),
        })
        .eq("id", session.id);

      loadTodayUsage(user.id);
    }
  }, [minutes, seconds, running, session, user, loadTodayUsage]);

  const finishBreak = async () => {
    // start a new break immediately when user finishes the completed session
    setIsFinished(false);
    await startBreak(true);
  };

  return (
    <div className="break-timer m-auto">
      <div className="break-timer-header">
        <div>
          <h2>Break Timer</h2>
          <p>{running ? "Break is running" : "Ready for your next break"}</p>
        </div>

        <span className={`timer-status ${running ? "active" : ""}`}>
          {running
            ? "Active"
            : isFinished
              ? "Finished"
              : isPaused
                ? "Paused"
                : "Ready"}
        </span>
      </div>

      <div className="timer-display">
        <span>{formatTime(minutes, seconds)}</span>
        <small>remaining</small>
      </div>

      <div
        className="timer-progress"
        aria-label={`${Math.round(progressPercent)}% remaining`}>
        <span style={{ width: `${progressPercent}%` }}></span>
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
        {!isFinished && !session && (
          <button className="timer-button primary" onClick={startBreak}>
            Start
          </button>
        )}

        {isFinished && (
          <button className="timer-button primary" onClick={finishBreak}>
            Finish
          </button>
        )}

        {session?.is_paused && !isFinished && (
          <button className="timer-button primary" onClick={resumeBreak}>
            Resume
          </button>
        )}

        {running && !isFinished && (
          <button className="timer-button secondary" onClick={pauseBreak}>
            Pause
          </button>
        )}
      </div>

      {isFinished && <div className="timer-finished">Finished</div>}
    </div>
  );
}
