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

/** Welcome email — fired after a new user is verified (OTP or Google OAuth). */
export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const rawFirst = (name || "").trim().split(" ")[0] || "";
  const isRealName =
    /^[A-Z][a-zA-Z]{2,}$/.test(rawFirst) || /^[A-Z][a-z]+[-' ][A-Z][a-z]+$/.test(rawFirst);
  const firstName = isRealName ? rawFirst : "there";

  const baseUrl = env.frontendUrl && !/localhost|:3000|:4000|3\.24\.173\.212/i.test(env.frontendUrl)
    ? env.frontendUrl
    : "https://algopulse.in";
  const dashboardUrl = `${baseUrl}/dashboard`;
  const logoUrl = `${baseUrl}/lightlogo.svg`;

  try {
    await sendMail({
      to,
      subject: `You're in, ${firstName} — welcome to AlgoPulse`,
      text: [
        `Hey ${firstName}!`,
        "",
        "Welcome to AlgoPulse — glad you're here.",
        "",
        "We built AlgoPulse for traders who'd rather let the market do the grunt work while they sleep, travel, or actually enjoy their weekends. You just joined that club.",
        "",
        "3 steps to get rolling:",
        "1. Connect your broker (CoinDCX, Delta India, Pi42, or Bybit) with a trade-only API key.",
        "2. Pick a strategy — each one ships with a 3-year backtest report.",
        "3. Deploy with one click. Monitor, pause, or stop anytime.",
        "",
        `Start here: ${dashboardUrl}`,
        "",
        "A note from us: Trading is hard. Even the best strategies lose sometimes. Start small, watch your numbers, and let data guide you — not FOMO.",
        "",
        "— The AlgoPulse Team",
      ].join("\n"),
      replyTo: "algopulseteam@gmail.com",
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to AlgoPulse</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">Your algorithmic trading journey begins. 3 quick steps to deploy your first strategy.</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f1f5f9;"><tr><td style="padding:40px 16px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" align="center" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
      <tr><td style="padding:32px 32px 0;text-align:center;">
        <img src="${logoUrl}" alt="AlgoPulse" height="32" style="display:block;margin:0 auto;height:32px;border:0;outline:none;text-decoration:none;"/>
      </td></tr>
      <tr><td style="padding:28px 32px 0;">
        <div style="background:linear-gradient(135deg,#0089FF 0%,#0066cc 100%);border-radius:16px;padding:40px 24px;text-align:center;">
          <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:999px;padding:6px 14px;margin-bottom:18px;"><span style="font-size:12px;color:#ffffff;font-weight:600;letter-spacing:0.3px;">🎉 You're officially in</span></div>
          <h1 style="font-size:30px;font-weight:800;color:#ffffff;margin:0 0 10px;line-height:1.2;letter-spacing:-0.6px;">Hey ${firstName}!</h1>
          <p style="font-size:15px;color:rgba(255,255,255,0.92);margin:0;line-height:1.5;">Welcome to AlgoPulse — glad you're here.</p>
        </div>
      </td></tr>
      <tr><td style="padding:30px 32px 8px;">
        <p style="font-size:16px;line-height:1.65;color:#334155;margin:0 0 14px;">We built AlgoPulse for traders who'd rather let the market do the grunt work — while they sleep, travel, or actually enjoy their weekends.</p>
        <p style="font-size:16px;line-height:1.65;color:#0089FF;margin:0;font-weight:600;">You just joined that club. 👏</p>
      </td></tr>
      <tr><td style="padding:24px 32px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="background:#f8fafc;border-radius:14px;padding:18px 12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
            <td style="text-align:center;width:25%;"><p style="font-size:22px;font-weight:800;color:#0089FF;margin:0;line-height:1.1;">10+</p><p style="font-size:11px;color:#64748b;margin:4px 0 0;font-weight:500;">Strategies</p></td>
            <td style="text-align:center;width:25%;"><p style="font-size:22px;font-weight:800;color:#0089FF;margin:0;line-height:1.1;">4</p><p style="font-size:11px;color:#64748b;margin:4px 0 0;font-weight:500;">Exchanges</p></td>
            <td style="text-align:center;width:25%;"><p style="font-size:22px;font-weight:800;color:#0089FF;margin:0;line-height:1.1;">18</p><p style="font-size:11px;color:#64748b;margin:4px 0 0;font-weight:500;">Coins</p></td>
            <td style="text-align:center;width:25%;"><p style="font-size:22px;font-weight:800;color:#0089FF;margin:0;line-height:1.1;">3yr</p><p style="font-size:11px;color:#64748b;margin:4px 0 0;font-weight:500;">Backtests</p></td>
          </tr></table>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:36px 32px 0;text-align:center;">
        <p style="font-size:11px;font-weight:700;letter-spacing:2px;color:#0089FF;margin:0 0 6px;text-transform:uppercase;">Get started</p>
        <h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0;letter-spacing:-0.3px;">3 steps. 5 minutes. You're live.</h2>
      </td></tr>
      <tr><td style="padding:24px 32px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:14px;"><tr><td style="padding:20px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
            <td style="width:56px;vertical-align:top;"><div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);text-align:center;line-height:44px;font-size:22px;">🔗</div></td>
            <td style="vertical-align:top;padding-left:14px;">
              <span style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:0.6px;margin-bottom:8px;">STEP 1</span>
              <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px;">Connect your broker</p>
              <p style="font-size:14px;line-height:1.6;color:#64748b;margin:0;">Link CoinDCX, Delta India, Pi42, or Bybit with a <strong style="color:#334155;">trade-only API key</strong>. We never touch your funds.</p>
            </td>
          </tr></table>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:12px 32px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:14px;"><tr><td style="padding:20px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
            <td style="width:56px;vertical-align:top;"><div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%);text-align:center;line-height:44px;font-size:22px;">📊</div></td>
            <td style="vertical-align:top;padding-left:14px;">
              <span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:0.6px;margin-bottom:8px;">STEP 2</span>
              <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px;">Pick a strategy that suits you</p>
              <p style="font-size:14px;line-height:1.6;color:#64748b;margin:0;">10+ pre-built strategies, each with a <strong style="color:#334155;">3-year backtest report</strong>. See win rate, drawdown, equity curves — before you risk a single rupee.</p>
            </td>
          </tr></table>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:12px 32px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:14px;"><tr><td style="padding:20px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
            <td style="width:56px;vertical-align:top;"><div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);text-align:center;line-height:44px;font-size:22px;">🚀</div></td>
            <td style="vertical-align:top;padding-left:14px;">
              <span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:0.6px;margin-bottom:8px;">STEP 3</span>
              <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px;">Deploy and chill</p>
              <p style="font-size:14px;line-height:1.6;color:#64748b;margin:0;">One click to go live. Monitor PnL real-time, pause anytime, stop whenever. <em style="color:#475569;">Markets don't sleep, but you can.</em></p>
            </td>
          </tr></table>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:38px 32px 0;text-align:center;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#0089FF;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;box-shadow:0 8px 20px rgba(0,137,255,0.28);">Go to Dashboard →</a>
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0;">Takes 5 minutes to get your first strategy live</p>
      </td></tr>
      <tr><td style="padding:40px 32px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f8fafc;border-radius:14px;border-left:4px solid #0089FF;"><tr><td style="padding:22px 24px;">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#475569;margin:0 0 12px;text-transform:uppercase;">💬 A note from us</p>
          <p style="font-size:14px;color:#334155;line-height:1.65;margin:0 0 12px;">Trading is hard. Even the best strategies lose sometimes. Start small, watch your numbers, and let data guide you — <strong>not FOMO</strong>.</p>
          <p style="font-size:14px;color:#334155;line-height:1.65;margin:0 0 16px;">We're building AlgoPulse to be the platform <em>we</em> wished existed when we started. Glad to have you along.</p>
          <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0;">— The AlgoPulse Team</p>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:32px 32px 32px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
          <td style="text-align:center;width:33%;padding:0 6px;"><p style="font-size:22px;margin:0;">🔒</p><p style="font-size:11px;color:#64748b;margin:6px 0 0;line-height:1.4;font-weight:500;">Trade-only<br/>API keys</p></td>
          <td style="text-align:center;width:34%;padding:0 6px;"><p style="font-size:22px;margin:0;">🇮🇳</p><p style="font-size:11px;color:#64748b;margin:6px 0 0;line-height:1.4;font-weight:500;">Built for<br/>Indian traders</p></td>
          <td style="text-align:center;width:33%;padding:0 6px;"><p style="font-size:22px;margin:0;">💬</p><p style="font-size:11px;color:#64748b;margin:6px 0 0;line-height:1.4;font-weight:500;">Real human<br/>support</p></td>
        </tr></table>
      </td></tr>
    </table>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" align="center" style="max-width:560px;margin:24px auto 0;"><tr><td style="text-align:center;padding:0 20px;">
      <p style="font-size:12px;color:#94a3b8;margin:0 0 6px;font-weight:500;">AlgoPulse — Algorithmic Crypto Trading</p>
      <p style="font-size:11px;color:#cbd5e1;margin:0;line-height:1.5;">You're receiving this because you just signed up for AlgoPulse.</p>
    </td></tr></table>
  </td></tr></table>
</body>
</html>`,
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
