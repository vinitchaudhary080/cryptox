/**
 * Telegram bot integration — guaranteed-delivery notification channel.
 *
 * Architecture:
 *   • One Telegram bot owned by AlgoPulse (`@algopulse_alerts_bot`).
 *   • Each user opts in via Settings → Connect Telegram, which generates a
 *     short-lived one-time code. User taps a deep-link that opens the bot
 *     pre-filled with `/start <CODE>`. The bot webhook receives that on
 *     our backend, matches the code, and stores `users.telegramChatId`.
 *   • Once linked, every `notification.service.ts → createNotification()`
 *     call also fires a Telegram message to that chat — fire-and-forget,
 *     never blocks the caller, never throws into the notification flow.
 *
 * Why Telegram (in addition to web push):
 *   Web push delivery on iOS PWAs is unreliable in practice. Telegram's
 *   own background service is OS-managed and battery-immune, so critical
 *   trade-event alerts arrive within 1 second regardless of whether the
 *   AlgoPulse PWA is open. See `push.service.ts` for the web-push path —
 *   the two channels run in parallel; either independently sufficient.
 */
import { PrismaClient } from "@prisma/client";
import { request as httpsRequest } from "node:https";

const prisma = new PrismaClient();

const TELEGRAM_API_HOST = "api.telegram.org";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "algopulse_alerts_bot";

// Link-code parameters. The code is human-typeable as a fallback (in
// case the deep-link doesn't pre-fill on some Telegram clients), but the
// expiry is short so a leaked code can't be replayed days later.
const LINK_CODE_LENGTH = 8;
const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — typo-resistant

function isConfigured(): boolean {
  if (!BOT_TOKEN) {
    // Silent during normal operation — backend boots fine without Telegram,
    // it just becomes a no-op layer. Logged once at module load below.
    return false;
  }
  return true;
}

if (!BOT_TOKEN) {
  console.warn(
    "[telegram] TELEGRAM_BOT_TOKEN not set — Telegram notifications disabled. " +
      "Set it in backend/.env to enable.",
  );
}

// ─── Low-level Telegram API call ───────────────────────────────

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * IMPORTANT — uses node:https instead of the global fetch().
 *
 * Why: AWS EC2 instances default to IPv4-only outbound networking, but
 * api.telegram.org publishes both A and AAAA DNS records. Node 24's
 * built-in fetch (undici) tries the IPv6 address first via Happy
 * Eyeballs and gets ENETUNREACH immediately, but the fallback to IPv4
 * doesn't kick in reliably — every Telegram call from EC2 hangs and
 * eventually fails with ETIMEDOUT. node:https with `family: 4` forces
 * the IPv4 path that curl uses, which works.
 *
 * If undici's happy-eyeballs is ever fixed upstream, this can revert to
 * a normal fetch() call.
 */
async function callTelegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const payload = JSON.stringify(body);
  return new Promise<TelegramApiResponse<T>>((resolve, reject) => {
    const req = httpsRequest(
      {
        host: TELEGRAM_API_HOST,
        port: 443,
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        family: 4, // force IPv4 — see comment above
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          try {
            resolve(JSON.parse(raw) as TelegramApiResponse<T>);
          } catch {
            resolve({ ok: false, description: `non-JSON response: ${raw.slice(0, 100)}` });
          }
        });
      },
    );
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy(new Error("Telegram API timeout (10s)"));
    });
    req.write(payload);
    req.end();
  });
}

// ─── Send a Telegram message to a linked user ──────────────────

export interface TelegramSendPayload {
  /** Optional pre-formatted text. If absent, caller must provide title+body. */
  text?: string;
  /**
   * Optional pre-formatted HTML payload (parse_mode=HTML). Takes precedence
   * over `text` + `title`/`body`. Lets `notification.service.ts` ship rich
   * pretty templates (bold headers, `<pre>` aligned blocks) without going
   * through MarkdownV2's escape gauntlet. The caller MUST pre-escape any
   * `<`, `>`, `&` that aren't part of intended HTML tags.
   */
  html?: string;
  title?: string;
  body?: string;
  /** Optional inline button (e.g., "Open AlgoPulse" → app URL). */
  link?: { url: string; label: string };
}

/**
 * Send a Telegram message to a user — by their cryptox userId, not their
 * Telegram chat_id. Looks up `telegramChatId` from DB; if not linked,
 * silently returns false. Never throws — failure to send Telegram is
 * never allowed to break the notification flow.
 */
export async function sendTelegramMessage(
  userId: string,
  payload: TelegramSendPayload,
): Promise<boolean> {
  if (!isConfigured()) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true },
  });

  if (!user?.telegramChatId) return false;

  // Resolve format + body. HTML takes precedence — templates pass it ready
  // to send (already escaped where needed). Otherwise fall back to the
  // legacy MarkdownV2 path that escapes title/body for safety.
  const useHtml = !!payload.html;
  const text = useHtml
    ? payload.html!
    : payload.text ??
      [
        payload.title ? `*${escapeMarkdown(payload.title)}*` : null,
        payload.body ? escapeMarkdown(payload.body) : null,
      ]
        .filter(Boolean)
        .join("\n\n");

  if (!text) return false;

  const reply_markup = payload.link
    ? { inline_keyboard: [[{ text: payload.link.label, url: payload.link.url }]] }
    : undefined;

  try {
    const res = await callTelegramApi<{ message_id: number }>("sendMessage", {
      chat_id: user.telegramChatId,
      text,
      parse_mode: useHtml ? "HTML" : "MarkdownV2",
      disable_web_page_preview: true,
      ...(reply_markup ? { reply_markup } : {}),
    });

    if (!res.ok) {
      // 403 "Forbidden: bot was blocked by the user" → user unlinked from
      // Telegram side. Treat as soft-disconnect: clear chatId so we stop
      // wasting API calls until they re-link.
      if (res.error_code === 403) {
        console.warn(
          `[telegram] user ${userId} blocked the bot — clearing chatId.`,
        );
        await prisma.user
          .update({
            where: { id: userId },
            data: { telegramChatId: null },
          })
          .catch(() => {});
      } else {
        console.warn(
          `[telegram] send to user ${userId} failed: ${res.error_code} ${res.description}`,
        );
      }
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[telegram] network error sending to user ${userId}: ${(err as Error).message}`,
    );
    return false;
  }
}

// MarkdownV2 reserves a strict set of characters that MUST be escaped
// even inside literal text — otherwise the message is rejected with
// "can't parse entities". Doing this every send is cheaper than
// debugging a one-off rejection in production.
function escapeMarkdown(s: string): string {
  return s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// ─── Link-code lifecycle ───────────────────────────────────────

function generateRandomCode(length = LINK_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += LINK_CODE_ALPHABET[Math.floor(Math.random() * LINK_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Create (or refresh) a one-time link code for a user. Returns the code
 * plus the deep-link URL to open Telegram with the code pre-filled.
 *
 * If the user is already linked, this still issues a new code — calling
 * `/start CODE` again from a different Telegram account will RE-link,
 * overwriting the previous chat_id. This is intentional: it's how a user
 * moves their alerts from one Telegram account to another.
 */
export async function generateLinkCode(
  userId: string,
): Promise<{ code: string; deepLink: string; expiresAt: Date }> {
  // Loop just in case of (extremely rare) collision on the unique index.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRandomCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { telegramLinkCode: code, telegramLinkExpiry: expiresAt },
      });
      return {
        code,
        deepLink: `https://t.me/${BOT_USERNAME}?start=${code}`,
        expiresAt,
      };
    } catch (err: unknown) {
      // Unique-constraint violation — try again with a fresh code.
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate a unique Telegram link code after 5 attempts");
}

/**
 * Match a code from `/start CODE` against any user's pending link code.
 * On hit, stores the chat_id and clears the code. On miss / expiry,
 * returns null — caller (the webhook handler) responds with an error
 * message to the user in Telegram.
 */
export async function linkChatIdToUser(
  code: string,
  chatId: string,
): Promise<{ userId: string; email: string } | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;

  const user = await prisma.user.findUnique({
    where: { telegramLinkCode: trimmed },
    select: { id: true, email: true, telegramLinkExpiry: true },
  });
  if (!user) return null;

  if (user.telegramLinkExpiry && user.telegramLinkExpiry < new Date()) {
    // Expired — wipe the stale code so it can't be re-used and the next
    // /start attempt fails cleanly.
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramLinkCode: null, telegramLinkExpiry: null },
    });
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: chatId,
      telegramLinkCode: null,
      telegramLinkExpiry: null,
    },
  });

  return { userId: user.id, email: user.email };
}

/** Disconnect — clear chat_id. User won't receive any more messages. */
export async function disconnectTelegram(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      telegramChatId: null,
      telegramLinkCode: null,
      telegramLinkExpiry: null,
    },
  });
}

/** Status for the Settings UI. */
export async function getTelegramStatus(
  userId: string,
): Promise<{ connected: boolean; botUsername: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true },
  });
  return {
    connected: !!user?.telegramChatId,
    botUsername: BOT_USERNAME,
  };
}

// ─── Webhook helper: send a one-off message by chat_id ─────────
// Used during the link flow to reply to the user's /start before any
// DB linkage exists — sendTelegramMessage() above requires a userId.

export async function sendByChatId(
  chatId: string | number,
  text: string,
): Promise<void> {
  if (!isConfigured()) return;
  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  }).catch((e) => console.warn("[telegram] sendByChatId failed:", e));
}

// Re-export for callers that only need the escape (e.g., route handlers
// composing their own messages).
export { escapeMarkdown };
