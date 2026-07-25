import emailjs from "emailjs-com";

const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

if (publicKey) {
  emailjs.init(publicKey);
}

export const sendVerificationCodeEmail = async (
  recipientEmail,
  code,
  firstName = "",
  lastName = "",
) => {
  if (!serviceId || !templateId || !publicKey) {
    console.warn(
      "EmailJS is not configured. Set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY.",
    );
    return { success: false, reason: "missing_config" };
  }

  const fullName = `${firstName || ""} ${lastName || ""}`.trim();

  try {
    await emailjs.send(
      serviceId,
      templateId,
      {
        to_email: recipientEmail,
        to_name: fullName,
        name: fullName,
        first_name: firstName,
        last_name: lastName,
        email: recipientEmail,
        verification_code: code,
        code,
        otp: code,
        verificationCode: code,
        app_name: "Break",
        message: `Hello ${fullName}, your verification code is ${code}`,
      },
      publicKey,
    );

    return { success: true };
  } catch (error) {
    console.error("EmailJS send failed", error);
    return { success: false, reason: "send_failed", error };
  }
};
