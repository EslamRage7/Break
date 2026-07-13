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
    const { user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();

    const cairoToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(now);

    const attendanceDate = cairoToday;

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
      .lte("from_date", attendanceDate)
      .or(`to_date.is.null,to_date.gte.${attendanceDate}`)
      .maybeSingle();

    if (shiftError) throw shiftError;

    const shift = shiftData?.shifts;
    const shiftName = shift?.shift_name || "No Shift";

    const buildTimestampFromTime = (timeValue) => {
      const [h, m, s = "00"] = timeValue.split(":");

      const date = new Date(now);

      date.setUTCHours(Number(h) - 3, Number(m), Number(s), 0);

      return date.toISOString();
    };
    const defaultShiftEnd = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const shiftStartTime = shift?.start_time
      ? buildTimestampFromTime(shift.start_time)
      : now.toISOString();
    const shiftEndTime = shift?.end_time
      ? buildTimestampFromTime(shift.end_time)
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
