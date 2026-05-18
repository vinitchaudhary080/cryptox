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

const prisma = new PrismaClient();

const TELEGRAM_API_BASE = "https://api.telegram.org";
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

async function callTelegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TelegramApiResponse<T>;
}

// ─── Send a Telegram message to a linked user ──────────────────

export interface TelegramSendPayload {
  /** Optional pre-formatted text. If absent, caller must provide title+body. */
  text?: string;
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

  const text =
    payload.text ??
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
      parse_mode: "MarkdownV2",
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
