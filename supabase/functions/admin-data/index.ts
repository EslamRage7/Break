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
    const authHeader = req.headers.get("Authorization");

    const userClient = createClient(
      PROJECT_URL,
      Deno.env.get("SUPABASE_ANON_KEY"),
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const { data: currentEmployee, error: currentEmployeeError } =
      await supabase
        .from("employees")
        .select("role, team_id")
        .eq("user_id", user.id)
        .single();

    if (currentEmployeeError) throw currentEmployeeError;
    let employees = [];
    let breaks = [];
    let breakSegments = [];

    if (currentEmployee.role === "admin") {
      const { data, error } = await supabase
        .from("employees")
        .select("user_id,email,first_name,last_name,department,role,team_id")
        .order("first_name");

      if (error) throw error;

      employees = data || [];
    } else if (currentEmployee.role === "team_leader") {
      const { data, error } = await supabase
        .from("employees")
        .select("user_id,email,first_name,last_name,department,role,team_id")
        .eq("team_id", currentEmployee.team_id)
        .order("first_name");

      if (error) throw error;

      employees = data || [];
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Forbidden",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const ids = employees.map((e) => e.user_id);

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          employees: [],
          breaks: [],
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (ids.length) {
      const { data, error } = await supabase
        .from("break_sessions")
        .select(
          "id,user_id,start_time,end_time,duration_minutes,duration_seconds,used_minutes,used_seconds,status,is_paused,paused_at",
        )
        .in("user_id", ids)
        .order("start_time", { ascending: false });

      if (error) throw error;

      breaks = data;
    }
    if (ids.length) {
      const { data, error } = await supabase
        .from("break_segments")
        .select("*")
        .in("user_id", ids)
        .order("start_time", { ascending: false });

      if (error) throw error;

      breakSegments = data || [];
    }

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
        break_segments: breakSegments,
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
