import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: false, // STARTTLS
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
});

// Disposable email domains to block
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "temp-mail.org", "fakeinbox.com", "sharklasers.com", "guerrillamailblock.com",
  "grr.la", "dispostable.com", "yopmail.com", "trashmail.com", "tempail.com",
  "10minutemail.com", "mailnesia.com", "maildrop.cc", "discard.email",
  "mohmal.com", "getnada.com", "emailondeck.com", "33mail.com",
  "mailcatch.com", "inboxkitten.com", "burnermail.io", "trash-mail.com",
  "tempr.email", "tempinbox.com", "mailsac.com", "harakirimail.com",
  "tmail.ws", "tmpmail.net", "tmpmail.org", "bupmail.com",
]);

/** Check if email domain is disposable/temporary */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return DISPOSABLE_DOMAINS.has(domain);
}

/** Generate 6-digit OTP */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Send OTP verification email */
export async function sendOTPEmail(to: string, otp: string): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject: `${otp} is your CryptoX verification code`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">
              Crypto<span style="color: #6366f1;">X</span>
            </h1>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="font-size: 14px; color: #64748b; margin: 0 0 8px;">Your verification code is</p>
            <p style="font-size: 36px; font-weight: 700; color: #0f172a; letter-spacing: 8px; margin: 0 0 16px;">
              ${otp}
            </p>
            <p style="font-size: 13px; color: #94a3b8; margin: 0;">
              This code expires in <strong>10 minutes</strong>
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
            If you didn't request this code, you can safely ignore this email.
          </p>

          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
              CryptoX — AI-Powered Crypto Trading
            </p>
          </div>
        </div>
      `,
    });

    console.log(`[Email] OTP sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send OTP to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Verify SMTP connection on startup */
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log("[Email] SMTP connection verified");
    return true;
  } catch (err) {
    console.error("[Email] SMTP connection failed:", (err as Error).message);
    return false;
  }
}
