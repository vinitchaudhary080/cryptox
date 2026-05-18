/**
 * Telegram bot routes.
 *
 *   POST /api/telegram/link-code     authed — issues a one-time link code
 *                                    + deep-link URL for the Settings UI.
 *
 *   GET  /api/telegram/status        authed — { connected, botUsername }
 *                                    for the Settings UI's connection chip.
 *
 *   POST /api/telegram/disconnect    authed — clears chat_id for the user.
 *
 *   POST /api/telegram/webhook       PUBLIC — Telegram bot webhook. Receives
 *                                    every update for the bot (currently we
 *                                    only handle `/start CODE`). Skips auth
 *                                    by design — Telegram doesn't sign
 *                                    requests with our session cookies. The
 *                                    optional secret-token header is the
 *                                    only verification.
 */
import { Router, type Request, type Response } from "express";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import {
  generateLinkCode,
  linkChatIdToUser,
  disconnectTelegram,
  getTelegramStatus,
  sendByChatId,
  escapeMarkdown,
} from "../services/telegram.service.js";

const router = Router();

// Optional shared secret — when set on the bot side via setWebhook's
// `secret_token` param, Telegram echoes it back in this header. We
// reject any inbound webhook that doesn't match. Empty = no check
// (acceptable for early rollout; rotate later).
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

// ─── Authenticated user routes ─────────────────────────────────

router.get("/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const status = await getTelegramStatus(req.user!.userId);
    res.json({ success: true, data: status });
  } catch (err) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/link-code", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { code, deepLink, expiresAt } = await generateLinkCode(req.user!.userId);
    res.json({ success: true, data: { code, deepLink, expiresAt } });
  } catch (err) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/disconnect", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await disconnectTelegram(req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Public webhook endpoint ───────────────────────────────────

// Telegram update payload — narrowed to the fields we actually need.
// See https://core.telegram.org/bots/api#update
interface TelegramUpdate {
  message?: {
    text?: string;
    from?: { id: number; first_name?: string; username?: string };
    chat?: { id: number; type: string };
  };
}

router.post("/webhook", async (req: Request, res: Response) => {
  // Always 200 to Telegram — if we don't, they retry with exponential
  // backoff and pile up. Errors are logged + swallowed.
  try {
    const headerSecret = req.header("x-telegram-bot-api-secret-token") ?? "";
    if (WEBHOOK_SECRET && headerSecret !== WEBHOOK_SECRET) {
      console.warn("[telegram] webhook called with wrong secret token");
      res.status(200).json({ ok: true });
      return;
    }

    const update = req.body as TelegramUpdate;
    const text = update.message?.text;
    const chatId = update.message?.chat?.id;
    const firstName = update.message?.from?.first_name;

    if (!text || chatId === undefined) {
      res.status(200).json({ ok: true });
      return;
    }

    // Handle `/start` with optional code arg.
    //   `/start`               → user opened the bot directly, no code → help message
    //   `/start ABCD1234`      → linking flow, look up code → bind chat
    const startMatch = text.match(/^\/start(?:\s+(\S+))?\s*$/);
    if (startMatch) {
      const code = startMatch[1];
      if (!code) {
        await sendByChatId(
          chatId,
          escapeMarkdown(
            `Hi ${firstName ?? "there"}! 👋\n\nTo link this Telegram to your AlgoPulse alerts, open AlgoPulse → Settings → Telegram Alerts → Connect Telegram. It'll bring you back here with a code.`,
          ),
        );
      } else {
        const linked = await linkChatIdToUser(code, String(chatId));
        if (linked) {
          await sendByChatId(
            chatId,
            escapeMarkdown(
              `✅ Connected! You'll now receive trade alerts on AlgoPulse here.\n\nLinked to: ${linked.email}`,
            ),
          );
        } else {
          await sendByChatId(
            chatId,
            escapeMarkdown(
              `❌ Code invalid or expired.\n\nGo back to AlgoPulse → Settings → Telegram Alerts and tap "Connect Telegram" again for a fresh code.`,
            ),
          );
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Unknown message — gentle hint and exit. (Avoid responding to every
    // message; could be noisy in groups.)
    if (update.message?.chat?.type === "private") {
      await sendByChatId(
        chatId,
        escapeMarkdown(
          `I only send trade alerts — I don't respond to messages. To connect: /start CODE`,
        ),
      );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[telegram] webhook error:", err);
    res.status(200).json({ ok: true });
  }
});

export default router;
