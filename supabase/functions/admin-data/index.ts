import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const PROJECT_URL =
      Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing PROJECT_URL or SERVICE_ROLE_KEY",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [
      { data: employees, error: employeesError },
      { data: breaks, error: breaksError },
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("user_id,email,first_name,last_name,department,role")
        .order("first_name", { ascending: true }),
      supabase
        .from("break_sessions")
        .select(
          "id,user_id,start_time,end_time,duration_minutes,duration_seconds,used_minutes,used_seconds,status,is_paused,paused_at",
        )
        .order("start_time", { ascending: false }),
    ]);

    if (employeesError) throw employeesError;
    if (breaksError) throw breaksError;

    // Keep only the latest break per user (breaks are ordered by start_time desc)
    const latestByUser = [];
    const seen = new Set();

    for (const b of breaks || []) {
      if (!seen.has(b.user_id)) {
        latestByUser.push(b);
        seen.add(b.user_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        employees: employees || [],
        breaks: latestByUser,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
