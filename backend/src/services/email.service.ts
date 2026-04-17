import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env.js";

// Transactional provider — Resend if configured + domain verified; otherwise
// fall back to the Gmail SMTP account. Resend delivers much better inbox
// placement because emails are signed SPF + DKIM for our own domain.
const resend = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;

/**
 * Unified email sender. Tries Resend first (if configured); on any failure
 * falls back to the Gmail SMTP transporter so emails don't silently drop.
 */
async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<void> {
  if (resend) {
    try {
      const resp = await resend.emails.send({
        from: env.resend.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: opts.replyTo,
        headers: {
          "List-Unsubscribe": "<mailto:algopulseteam@gmail.com?subject=unsubscribe>",
        },
      });
      if (!resp.error) {
        return; // delivered via Resend
      }
      console.warn("[Email] Resend failed, falling back to SMTP:", resp.error.message);
    } catch (err) {
      console.warn("[Email] Resend threw, falling back to SMTP:", (err as Error).message);
    }
  }

  // Fallback — Gmail SMTP via nodemailer
  await transporter.sendMail({
    from: env.smtp.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
  });
}

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
    await sendMail({
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
/** Password reset OTP — Step 1 of forgot-password flow */
export async function sendPasswordResetOtpEmail(to: string, otp: string): Promise<boolean> {
  try {
    await sendMail({
      to,
      subject: `${otp} — Reset your AlgoPulse password`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">AlgoPulse</h1>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="font-size: 14px; color: #64748b; margin: 0 0 8px;">Enter this code to reset your password</p>
            <p style="font-size: 36px; font-weight: 700; color: #0f172a; letter-spacing: 8px; margin: 0 0 16px;">
              ${otp}
            </p>
            <p style="font-size: 13px; color: #94a3b8; margin: 0;">
              This code expires in <strong>10 minutes</strong>
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; line-height: 1.5;">
            If you didn't request a password reset, you can safely ignore this email — your account is still secure.
          </p>

          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
              AlgoPulse — Algorithmic Crypto Trading
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Password reset OTP sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send reset OTP to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Post-change confirmation — lets the user know their password was just changed */
export async function sendPasswordResetConfirmationEmail(to: string): Promise<boolean> {
  try {
    const when = new Date().toUTCString();
    await sendMail({
      to,
      subject: `Your AlgoPulse password was changed`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">AlgoPulse</h1>
          </div>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px;">
            <p style="font-size: 14px; font-weight: 600; color: #166534; margin: 0 0 8px;">✓ Password changed successfully</p>
            <p style="font-size: 13px; color: #15803d; margin: 0;">Changed at: <strong>${when}</strong></p>
          </div>

          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-top: 24px;">
            Your AlgoPulse account password was just changed. All your existing sessions have been logged out — please sign in again with your new password.
          </p>

          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin-top: 16px;">
            <p style="font-size: 12px; color: #991b1b; line-height: 1.5; margin: 0;">
              <strong>Didn't do this?</strong> Reset your password again immediately and contact support.
            </p>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
              AlgoPulse — Algorithmic Crypto Trading
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Password change confirmation sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send reset confirmation to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Welcome email — fired after a new user is verified (OTP or Google OAuth) */
export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const firstName = (name || "").trim().split(" ")[0] || "trader";
  const dashboardUrl = `${env.frontendUrl}/dashboard`;

  try {
    await sendMail({
      to,
      subject: `You're in, ${firstName} — welcome to AlgoPulse 🎉`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; color: #0f172a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; font-weight: 700; color: #0f172a; margin: 0; letter-spacing: -0.5px;">AlgoPulse</h1>
          </div>

          <div style="background: linear-gradient(135deg, #0089FF 0%, #0066cc 100%); border-radius: 14px; padding: 32px 24px; color: #ffffff; text-align: center;">
            <p style="font-size: 14px; font-weight: 500; margin: 0 0 8px; opacity: 0.9;">Welcome aboard 🎉</p>
            <p style="font-size: 22px; font-weight: 700; margin: 0; line-height: 1.35;">Hey ${firstName}! 👋</p>
          </div>

          <div style="padding: 28px 4px 0;">
            <p style="font-size: 15px; line-height: 1.65; color: #1e293b; margin: 0 0 14px;">
              Welcome aboard. Seriously.
            </p>
            <p style="font-size: 15px; line-height: 1.65; color: #475569; margin: 0;">
              We built AlgoPulse for traders who'd rather let the market do the grunt work while they sleep, travel, or actually enjoy their weekends. You just joined that club.
            </p>
          </div>

          <div style="margin: 32px 0 8px;">
            <p style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #0089FF; margin: 0 0 16px; text-align: center;">Get rolling in the next 5 minutes</p>
          </div>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
                  <tr>
                    <td style="width: 44px; vertical-align: top;">
                      <div style="width: 36px; height: 36px; border-radius: 10px; background: #e0f2fe; text-align: center; line-height: 36px; font-size: 18px;">🔗</div>
                    </td>
                    <td style="vertical-align: top; padding-left: 4px;">
                      <p style="font-size: 14px; font-weight: 600; color: #0f172a; margin: 0 0 3px;">1. Connect your broker</p>
                      <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
                        Link CoinDCX, Delta India, Pi42, or Bybit with a trade-only API key. We never touch your funds.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
                  <tr>
                    <td style="width: 44px; vertical-align: top;">
                      <div style="width: 36px; height: 36px; border-radius: 10px; background: #dcfce7; text-align: center; line-height: 36px; font-size: 18px;">📊</div>
                    </td>
                    <td style="vertical-align: top; padding-left: 4px;">
                      <p style="font-size: 14px; font-weight: 600; color: #0f172a; margin: 0 0 3px;">2. Pick a strategy that suits you</p>
                      <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
                        10+ pre-built strategies, each with a transparent 3-year backtest report. See win rate, drawdown, equity curves — before you risk a single rupee.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 14px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
                  <tr>
                    <td style="width: 44px; vertical-align: top;">
                      <div style="width: 36px; height: 36px; border-radius: 10px; background: #fef3c7; text-align: center; line-height: 36px; font-size: 18px;">🚀</div>
                    </td>
                    <td style="vertical-align: top; padding-left: 4px;">
                      <p style="font-size: 14px; font-weight: 600; color: #0f172a; margin: 0 0 3px;">3. Deploy and chill</p>
                      <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
                        One click to go live. Monitor PnL real-time, pause anytime, stop whenever. Markets don't sleep, but you can.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <div style="text-align: center; margin: 36px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: #0089FF; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px;">
              Go to Dashboard →
            </a>
          </div>

          <div style="background: #f8fafc; border-radius: 12px; padding: 20px 22px; margin-top: 8px;">
            <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.5px; color: #475569; margin: 0 0 8px; text-transform: uppercase;">A small note from us</p>
            <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
              Trading is hard. Even the best strategies lose sometimes. Start small, watch your results, and let the numbers guide you — not FOMO. We're building AlgoPulse to be the platform we wished existed when we started. Glad to have you along for the ride.
            </p>
            <p style="font-size: 13px; font-weight: 600; color: #0f172a; margin: 12px 0 0;">
              — The AlgoPulse Team
            </p>
          </div>

          <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="font-size: 12px; color: #64748b; line-height: 1.6; margin: 0;">
              Got a question? Just reply to this email — it goes straight to us, no bots.<br/>
              We usually get back within a few hours.
            </p>
          </div>

          <div style="text-align: center; margin-top: 24px;">
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
              AlgoPulse — Algorithmic Crypto Trading
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Welcome email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send welcome email to ${to}:`, (err as Error).message);
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
