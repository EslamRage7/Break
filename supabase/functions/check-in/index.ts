import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, work_mode } = await req.json();

    const supabase = createClient(
      Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();

    const cairoParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .reduce((parts, part) => {
        if (part.type !== "literal") parts[part.type] = part.value;
        return parts;
      }, {} as Record<string, string>);

    const cairoLocalTimestamp = Date.UTC(
      Number(cairoParts.year),
      Number(cairoParts.month) - 1,
      Number(cairoParts.day),
      Number(cairoParts.hour),
    );
    const cairoCalendarDate = new Date(cairoLocalTimestamp)
      .toISOString()
      .slice(0, 10);
    console.log("user_id:", user_id);

    // Get current shift or use a safe fallback when none is assigned
    const { data: shiftData, error: shiftError } = await supabase
      .from("employee_shifts")
      .select(
        `
        shift_id,
        shifts(
          shift_name,
          start_time,
          end_time
        )
      `,
      )
      .eq("user_id", user_id)
      .lte("from_date", cairoCalendarDate)
      .or(`to_date.is.null,to_date.gte.${cairoCalendarDate}`)
      .maybeSingle();

    if (shiftError) throw shiftError;

    const shift = shiftData?.shifts;
    const shiftName = shift?.shift_name || "No Shift";
    const normalizedWorkLocation = work_mode === "office" ? "Office" : "Remote";

    // Night shifts normally renew at 03:00. The 00:00–08:00 shift stays on
    // its starting day until 11:00 so its employee can check in after midnight.
    const dayResetHour =
      shift?.start_time?.startsWith("00:00") &&
      shift?.end_time?.startsWith("08:00")
        ? 11
        : 3;
    const attendanceDate = new Date(
      cairoLocalTimestamp - dayResetHour * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    console.log("attendanceDate:", attendanceDate);

    const getCairoOffsetMinutes = (date) => {
      // compute offset (in minutes) between UTC and Cairo time for given date
      const utcTs = date.getTime();
      const cairo = new Date(
        date.toLocaleString("en-US", { timeZone: "Africa/Cairo" }),
      );
      return Math.round((cairo.getTime() - utcTs) / 60000);
    };

    const buildTimestampFromTime = (timeValue, dayOffset = 0) => {
      const [h, m, s = "00"] = timeValue.split(":");

      // attendanceDate is in format YYYY-MM-DD (Cairo date string)
      const [year, month, day] = attendanceDate.split("-").map(Number);

      // create UTC date matching the Cairo local date/time by using Date.UTC
      const utcTs = Date.UTC(
        year,
        month - 1,
        day + dayOffset,
        Number(h),
        Number(m),
        Number(s || "0"),
      );

      // compute Cairo offset for this date and convert to UTC timestamp
      const offsetMinutes = getCairoOffsetMinutes(new Date(utcTs));

      // cairo local -> UTC = local time - offset
      const correctedUtcTs = utcTs - offsetMinutes * 60000;

      return new Date(correctedUtcTs).toISOString();
    };
    const defaultShiftEnd = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const shiftStartTime = shift?.start_time
      ? buildTimestampFromTime(shift.start_time)
      : now.toISOString();
    const isOvernightShift =
      !!shift?.start_time &&
      !!shift?.end_time &&
      shift.end_time <= shift.start_time;
    const shiftEndTime = shift?.end_time
      ? buildTimestampFromTime(shift.end_time, isOvernightShift ? 1 : 0)
      : defaultShiftEnd.toISOString();

    const checkIn = new Date(now);
    const shiftStart = new Date(shiftStartTime);

    let earlyArrivalMinutes = 0;
    let lateMinutes = 0;

    if (checkIn < shiftStart) {
      earlyArrivalMinutes = Math.floor(
        (shiftStart.getTime() - checkIn.getTime()) / 60000,
      );
    }

    if (checkIn > shiftStart) {
      lateMinutes = Math.floor(
        (checkIn.getTime() - shiftStart.getTime()) / 60000,
      );
    }

    // تحقق إذا تم تسجيل حضور لنفس اليوم
    const { data: activeAttendance } = await supabase
      .from("attendance")
      .select("id")
      .eq("user_id", user_id)
      .is("check_out", null)
      .maybeSingle();
    console.log("activeAttendance:", activeAttendance);
    if (activeAttendance) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "You already have an active attendance.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const { data: todayAttendance, error: todayAttendanceError } =
      await supabase
        .from("attendance")
        .select("id")
        .eq("user_id", user_id)
        .eq("attendance_date", attendanceDate)
        .maybeSingle();

    if (todayAttendanceError) throw todayAttendanceError;
    if (todayAttendance) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "You have already checked in today.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log({
      shiftStartTime,
      shiftEndTime,
      shiftStartRaw: shift?.start_time,
      shiftEndRaw: shift?.end_time,
    });

    const { data, error } = await supabase
      .from("attendance")
      .insert({
        user_id,
        attendance_date: attendanceDate,

        shift_name: shiftName,

        shift_start: shiftStartTime,
        shift_end: shiftEndTime,

        check_in: now.toISOString(),

        early_arrival_minutes: earlyArrivalMinutes,
        late_minutes: lateMinutes,

        status: "Working",
        work_location: normalizedWorkLocation,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        attendance: data,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
