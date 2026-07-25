const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = body?.email;
    const code = body?.code || Math.floor(100000 + Math.random() * 900000).toString();

    console.log("send-verification-email request", { email, hadCode: !!body?.code });

    if (!email) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing email",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("SMTP_FROM") || "no-reply@break.app";

    console.log("RESEND_API_KEY present:", !!resendKey);

    if (!resendKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "RESEND_API_KEY is not configured in Edge Function secrets.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    const payload = {
      from: `Break App <${fromEmail}>`,
      to: email.trim().toLowerCase(),
      subject: "Email Verification",
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f5f5;padding:40px">
  <div style="max-width:500px;margin:auto;background:#fff;padding:30px;border-radius:12px">

    <h2 style="text-align:center;color:#2563eb">
      Break App
    </h2>

    <p>Hello,</p>

    <p>Your verification code is:</p>

    <div
      style="
      font-size:40px;
      letter-spacing:8px;
      font-weight:bold;
      text-align:center;
      color:#2563eb;
      margin:30px 0;
    "
    >
      ${code}
    </div>

    <p>This code will expire in <b>5 minutes</b>.</p>

    <p>If you didn't request this email, simply ignore it.</p>

  </div>
</div>
      `,
      text: `Your verification code is: ${code}`,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => ({}));

    console.log("Resend API response", { status: response.status, ok: response.ok, body: responseBody });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          message: responseBody.error || responseBody.message || "Resend API failed",
          details: responseBody,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: response.status || 500,
        },
      );
    }

    return new Response(JSON.stringify({ success: true, code, result: responseBody }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: 200,
    });
  } catch (error) {
 console.error(error);

return new Response(
  JSON.stringify({
    success: false,
    message: error instanceof Error ? error.message : "Unknown error",
  }),
  {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 500,
  },
);
  }
});