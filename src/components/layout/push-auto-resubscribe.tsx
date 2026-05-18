"use client";

/**
 * Silent push-subscription health-check, mounted in the (app) layout.
 *
 * Why this exists: the original flow registered the service worker AND
 * created the push subscription only when the user clicked the toggle in
 * Settings. Service worker registration is per-origin-per-browser; if the
 * user re-installed the PWA, switched browsers, cleared site data, or the
 * subscription silently expired, the backend `web-push` sender had no one
 * to deliver to — so notifications only "appeared" on the next visit via
 * the Socket.IO catch-up path, never as real push.
 *
 * This component runs on every authenticated app load and:
 *   1. Ensures the service worker is registered (cheap if already done).
 *   2. If the browser already has Notification permission "granted", it
 *      re-checks the PushSubscription and re-POSTs it to the backend so
 *      the DB always has a fresh endpoint+keys for this device.
 *   3. Does NOT prompt for permission — that still happens only in
 *      Settings on explicit user action. Browsers penalise un-prompted
 *      permission requests on page load.
 *
 * No UI, fire-and-forget, swallows errors (logs to console only).
 */
import { useEffect } from "react";
import {
  isPushSupported,
  getServiceWorker,
  getPermissionState,
  subscribeToPush,
} from "@/lib/push-notifications";

export function PushAutoResubscribe() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isPushSupported()) return;

      // Always register the SW — it's idempotent and required for push to
      // even be possible later. Cheap if already registered.
      const reg = await getServiceWorker();
      if (!reg || cancelled) return;

      // Only proceed to re-subscribe if the user has previously granted
      // permission. Anything else (default / denied) we leave alone.
      if (getPermissionState() !== "granted") return;

      try {
        const existing = await reg.pushManager.getSubscription();
        // Re-run the full subscribe-and-POST flow — subscribeToPush() reuses
        // an existing PushManager subscription when present, only creates a
        // new one if missing/expired, and always POSTs the current
        // endpoint+keys to the backend (which upserts on endpoint). Net
        // effect: the prod DB ends every page-load with a fresh row for
        // this device.
        if (!existing || existing.expirationTime) {
          await subscribeToPush();
        } else {
          // Already subscribed in the browser — still re-POST so DB has it
          // even if the previous POST failed silently.
          await subscribeToPush();
        }
      } catch (err) {
        console.warn("[push] auto-resubscribe skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
