// Password-reset email. SMTP (SMTP_URL or SMTP_HOST) is preferred, then Resend, then SendGrid.
// With none of those set, the caller logs the link outside production instead of sending.

export type OutboundMail = { to: string; subject: string; text: string; html: string };

export type EmailProvider = "smtp" | "resend" | "sendgrid";

export function emailProvider(): EmailProvider | null {
  if (process.env.SMTP_URL || process.env.SMTP_HOST) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SENDGRID_API_KEY) return "sendgrid";
  return null;
}

export function fromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_FROM || "Bertha <noreply@bertha.app>";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
}

export function passwordResetEmail(resetUrl: string): Pick<OutboundMail, "subject" | "text" | "html"> {
  const subject = "Reset your Bertha password";
  const text = [
    "Someone asked to reset the password for your Bertha account.",
    "",
    "Open this link to choose a new password. It expires in one hour and can only be used once:",
    resetUrl,
    "",
    "If you didn't ask for this, you can ignore this email. Your password will stay the same.",
  ].join("\n");
  const safeUrl = escapeHtml(resetUrl);
  const html = `<p>Someone asked to reset the password for your Bertha account.</p>
<p><a href="${safeUrl}">Choose a new password</a></p>
<p>This link expires in one hour and can only be used once. If you didn't ask for this, you can ignore this email. Your password will stay the same.</p>
<p>${safeUrl}</p>`;
  return { subject, text, html };
}

function parseFrom(from: string) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return { email: from.trim(), name: undefined as string | undefined };
  const name = match[1].replace(/^"|"$/g, "").trim();
  return { email: match[2].trim(), name: name || undefined };
}

async function sendViaSmtp(message: OutboundMail) {
  const { createTransport } = await import("nodemailer");
  const from = fromAddress();
  const transport = process.env.SMTP_URL
    ? createTransport(process.env.SMTP_URL)
    : createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1" || process.env.SMTP_PORT === "465",
        auth: (process.env.SMTP_USER || process.env.SMTP_USERNAME)
          ? { user: process.env.SMTP_USER || process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || "" }
          : undefined,
      });
  await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
}

async function sendViaResend(message: OutboundMail) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress(), to: [message.to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!response.ok) throw new Error(`Resend rejected the password reset email (${response.status}).`);
}

async function sendViaSendGrid(message: OutboundMail) {
  const from = parseFrom(fromAddress());
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: from.email, name: from.name },
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.text },
        { type: "text/html", value: message.html },
      ],
    }),
  });
  if (!response.ok) throw new Error(`SendGrid rejected the password reset email (${response.status}).`);
}

export async function sendMail(message: OutboundMail) {
  const provider = emailProvider();
  if (!provider) throw new Error("No email provider is configured.");
  if (provider === "smtp") return sendViaSmtp(message);
  if (provider === "resend") return sendViaResend(message);
  return sendViaSendGrid(message);
}
