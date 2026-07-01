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

    const { data: attendance, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user_id)
      .is("check_out", null)
      .order("check_in", { ascending: false })
      .limit(1)
      .single();

    if (error || !attendance) {
      throw new Error("No active attendance found.");
    }
    const checkIn = new Date(attendance.check_in);
    const checkOut = new Date();

    const workMinutes = Math.floor(
      (checkOut.getTime() - checkIn.getTime()) / 60000,
    );

    const createShiftDateTime = (timeValue) => {
      const [hours = "0", minutes = "0", seconds = "0"] =
        `${timeValue || "00:00:00"}`.split(":").map((part) => part.trim());

      const date = new Date(checkIn);
      date.setHours(Number(hours), Number(minutes), Number(seconds), 0);
      return date;
    };

    const shiftStart = createShiftDateTime(attendance.shift_start);
    const shiftEnd = createShiftDateTime(attendance.shift_end);

    if (shiftEnd <= shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    let lateMinutes = 0;
    let earlyMinutes = 0;
    let overtimeMinutes = 0;

    if (checkIn > shiftStart) {
      lateMinutes = Math.floor(
        (checkIn.getTime() - shiftStart.getTime()) / 60000,
      );
    }

    if (checkOut < shiftEnd) {
      earlyMinutes = Math.floor(
        (shiftEnd.getTime() - checkOut.getTime()) / 60000,
      );
    }

    if (checkOut > shiftEnd) {
      overtimeMinutes = Math.floor(
        (checkOut.getTime() - shiftEnd.getTime()) / 60000,
      );
    }

    let status = "Completed";

    if (lateMinutes > 0 && earlyMinutes > 0) {
      status = "Late + Early Leave";
    } else if (lateMinutes > 0 && overtimeMinutes > 0) {
      status = "Late + Overtime";
    } else if (earlyMinutes > 0 && overtimeMinutes > 0) {
      status = "Early Leave + Overtime";
    } else if (lateMinutes > 0) {
      status = "Late";
    } else if (earlyMinutes > 0) {
      status = "Early Leave";
    } else if (overtimeMinutes > 0) {
      status = "Overtime";
    }
    const { data, error: updateError } = await supabase
      .from("attendance")
      .update({
        check_out: checkOut.toISOString(),
        work_minutes: workMinutes,
        late_minutes: lateMinutes,
        early_minutes: earlyMinutes,
        overtime_minutes: overtimeMinutes,
        status,
      })
      .eq("id", attendance.id)
      .select()
      .single();

    if (updateError) throw updateError;

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
