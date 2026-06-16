"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AGENT_LOGOS } from "@/lib/agent-display";
import type { SessionEvent } from "@/lib/board-events";
import {
  formatBadgeCount,
  nextUnreadCount,
  notificationBody,
  shouldNotify,
} from "@/lib/notification-display";
import { BellIcon, BellOffIcon } from "@/components/ui/icons";

const REFRESH_THROTTLE_MS = 1000;

type BellState = "unsupported" | NotificationPermission;

// ---- Browser badge side effects (favicon, tab title, OS app badge) ----------
// All DOM-only; the count math is the pure nextUnreadCount in notification-display.

function ensureFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

/** Draw the app's "K" tile to the favicon, with a red unread bubble when count>0
 *  (Gmail/Slack-style). Also gives the app a favicon it otherwise lacks. */
function drawFaviconBadge(count: number): void {
  const link = ensureFaviconLink();
  if (!link) return;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Base tile: dark rounded square with a white "K".
  const r = 12;
  ctx.fillStyle = "#171717";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("K", size / 2, size / 2 + 2);

  if (count > 0) {
    const label = formatBadgeCount(count);
    const cx = size - 18;
    const cy = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, 17, 0, Math.PI * 2);
    // Canvas can't read CSS vars; keep roughly in step with --danger (globals.css).
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${label.length > 1 ? 22 : 28}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(label, cx, cy + 1);
  }

  link.type = "image/png";
  link.href = canvas.toDataURL("image/png");
}

/** OS app badge for installed-PWA users (no-op / unsupported in a plain tab). */
function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    // Badging API unsupported — favicon/bell still carry the count.
  }
}

const TITLE_PREFIX_RE = /^(\(\d+\) )?● /;

function applyTitle(count: number): void {
  if (typeof document === "undefined") return;
  const base = document.title.replace(TITLE_PREFIX_RE, "");
  document.title = count > 0 ? `(${count}) ● ${base}` : base;
}

/**
 * Listens to the server's SSE stream (/api/events) once per tab: refreshes the
 * current route on any agent session state change, fires a desktop notification
 * when an agent finishes / fails / needs you, and surfaces an unread badge on
 * the favicon, tab title, OS app badge, and the bell. The badge accumulates
 * while the tab is in the background and resets the moment you return to it.
 */
export default function NotificationCenter() {
  const router = useRouter();
  // null until mounted — the first render must not touch Notification (SSR).
  const [permission, setPermission] = useState<BellState | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setPermission(
      typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    );
  }, []);

  // Clear the badge once the user is back on the tab.
  useEffect(() => {
    const reset = () => {
      if (!document.hidden) setUnread(0);
    };
    document.addEventListener("visibilitychange", reset);
    window.addEventListener("focus", reset);
    return () => {
      document.removeEventListener("visibilitychange", reset);
      window.removeEventListener("focus", reset);
    };
  }, []);

  // Reflect the unread count on the favicon, tab title, and OS app badge.
  useEffect(() => {
    drawFaviconBadge(unread);
    applyTitle(unread);
    setAppBadge(unread);
  }, [unread]);

  useEffect(() => {
    let lastRefreshAt = 0;
    let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

    // At most one refresh per second; a burst schedules one trailing refresh.
    const scheduleRefresh = () => {
      const elapsed = Date.now() - lastRefreshAt;
      if (elapsed >= REFRESH_THROTTLE_MS) {
        lastRefreshAt = Date.now();
        router.refresh();
      } else if (!pendingRefresh) {
        pendingRefresh = setTimeout(() => {
          pendingRefresh = null;
          lastRefreshAt = Date.now();
          router.refresh();
        }, REFRESH_THROTTLE_MS - elapsed);
      }
    };

    const notify = (event: SessionEvent) => {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        return;
      }
      const notification = new Notification(event.ticketTitle, {
        body: notificationBody(event),
        tag: event.sessionDbId,
        icon: AGENT_LOGOS[event.agent],
      });
      notification.onclick = () => {
        window.focus();
        router.push(`/tickets/${event.ticketId}`);
      };
    };

    const source = new EventSource("/api/events");
    source.onmessage = (message) => {
      let event: SessionEvent;
      try {
        event = JSON.parse(message.data) as SessionEvent;
      } catch {
        return; // ignore malformed frames
      }
      scheduleRefresh();
      if (!shouldNotify(event)) return;
      notify(event);
      // Functional update + document.hidden read avoids a stale closure and
      // keeps this effect subscribed once (no `unread` dependency).
      setUnread((prev) => nextUnreadCount(prev, event, document.hidden));
    };
    // No onerror handler: EventSource reconnects on its own.

    return () => {
      source.close();
      if (pendingRefresh) clearTimeout(pendingRefresh);
    };
  }, [router]);

  if (permission === null || permission === "unsupported") return null;

  const title =
    permission === "granted"
      ? "Desktop notifications on"
      : permission === "denied"
        ? "Notifications blocked in browser settings"
        : "Enable desktop notifications";

  const requestPermission = () => {
    if (permission !== "default" || typeof Notification === "undefined") return;
    Notification.requestPermission().then(setPermission);
  };

  return (
    <button
      type="button"
      onClick={requestPermission}
      title={title}
      aria-label={
        unread > 0 ? `${title} — ${unread} unread` : title
      }
      className={`fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface shadow-md transition-colors hover:bg-panel ${
        permission === "granted"
          ? "text-accent"
          : permission === "denied"
            ? "cursor-default text-faint"
            : "text-muted"
      }`}
    >
      {permission === "denied" ? (
        <BellOffIcon className="h-5 w-5" aria-hidden="true" />
      ) : (
        <BellIcon
          className="h-5 w-5"
          fill={permission === "granted" ? "currentColor" : "none"}
          aria-hidden="true"
        />
      )}
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-canvas"
        >
          {formatBadgeCount(unread)}
        </span>
      )}
    </button>
  );
}
