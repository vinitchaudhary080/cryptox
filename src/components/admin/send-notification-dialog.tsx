"use client";

import { useState } from "react";
import { Loader2, Send, Users, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notificationApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type Target = "all" | "user";
type Status =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

interface Props {
  trigger: React.ReactNode;
}

export function SendNotificationDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>("all");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const reset = () => {
    setTarget("all");
    setUserId("");
    setTitle("");
    setMessage("");
    setUrl("");
    setStatus({ kind: "idle" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "idle" });

    if (!title.trim() || !message.trim()) {
      setStatus({ kind: "error", message: "Title and message are required" });
      return;
    }
    if (target === "user" && !userId.trim()) {
      setStatus({ kind: "error", message: "User ID required when targeting a specific user" });
      return;
    }

    setLoading(true);
    try {
      const resp = (await notificationApi.adminSend({
        title: title.trim(),
        message: message.trim(),
        userId: target === "user" ? userId.trim() : undefined,
        url: url.trim() || undefined,
      })) as { success: boolean; data?: { sentTo: number }; error?: string };

      if (resp.success) {
        setStatus({
          kind: "success",
          message: `Sent to ${resp.data?.sentTo ?? "?"} user(s)`,
        });
        setTitle("");
        setMessage("");
        setUrl("");
        setUserId("");
      } else {
        setStatus({ kind: "error", message: resp.error || "Failed to send" });
      }
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger}
      </span>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Send notification</DialogTitle>
          <DialogDescription>
            Broadcast to all users or a specific user. Delivered in-app, via socket, and web push.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target */}
          <div className="space-y-2">
            <Label>Target</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTarget("all")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  target === "all"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                )}
              >
                <Users className="h-4 w-4" /> All users
              </button>
              <button
                type="button"
                onClick={() => setTarget("user")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  target === "user"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                )}
              >
                <User className="h-4 w-4" /> Specific user
              </button>
            </div>
          </div>

          {target === "user" && (
            <div className="space-y-2">
              <Label htmlFor="nx-user-id">User ID</Label>
              <Input
                id="nx-user-id"
                placeholder="bf9a3bf5-c962-4225-8b93-3fffc6754535"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="nx-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nx-title"
              placeholder="Heads up — maintenance at 3 AM"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="nx-message">
              Message <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="nx-message"
              placeholder="The trading engine will be offline for ~10 minutes…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
              className="flex min-h-[76px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/500</p>
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="nx-url">Deep-link URL (optional)</Label>
            <Input
              id="nx-url"
              placeholder="/deployed  or  https://algopulse.in/reports"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {/* Status */}
          {status.kind !== "idle" && (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                status.kind === "success"
                  ? "border-profit/30 bg-profit/10 text-profit"
                  : "border-red-500/30 bg-red-500/10 text-red-500",
              )}
            >
              {status.message}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Send
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
