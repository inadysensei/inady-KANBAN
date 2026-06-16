"use client";

import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type ClientMessage, parseServerMessage } from "@/lib/terminal-protocol";
import type { SessionActivity } from "@/db/schema";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { ICON_SIZE_SM, StopIcon } from "@/components/ui/icons";

type Status = "connecting" | "running" | "exited" | "error";

export default function Terminal({
  sessionDbId,
  resume,
  activity = null,
  onReady,
  onExit,
  onRetry,
  onFirstInput,
  actions,
}: {
  sessionDbId: string;
  resume: boolean;
  activity?: SessionActivity | null;
  onReady?: () => void;
  onExit?: (code: number) => void;
  onRetry?: () => void;
  /** Fired once, on the first keystroke the user sends to this terminal — i.e.
   *  they actually started interacting, as opposed to just viewing it. */
  onFirstInput?: () => void;
  /** Extra controls rendered in the header, to the right of the Kill button. */
  actions?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onFirstInputRef = useRef(onFirstInput);
  onFirstInputRef.current = onFirstInput;
  const [status, setStatus] = useState<Status>("connecting");
  const [detail, setDetail] = useState<string | null>(null);

  const sendKill = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "kill" } satisfies ClientMessage));
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#1e1e1e", foreground: "#e5e5e5" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      // container not measured yet; window resize / refit will correct it
    }

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/terminal/${encodeURIComponent(sessionDbId)}`,
    );
    wsRef.current = ws;

    const sendClient = (msg: ClientMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.onopen = () => {
      sendClient({ type: "start", cols: term.cols, rows: term.rows, resume });
    };

    ws.onmessage = (ev) => {
      const msg = parseServerMessage(ev.data as string);
      if (!msg) return;
      switch (msg.type) {
        case "ready":
          setStatus("running");
          onReadyRef.current?.();
          break;
        case "replay":
          // `replay` is a one-shot, full-screen snapshot of the server-side
          // mirror (sent once on attach). Reset first so it's authoritative:
          // any live `stdout` that raced ahead of it is cleared, then the
          // snapshot repaints the screen cleanly instead of layering on top.
          term.reset();
          term.write(msg.data);
          break;
        case "stdout":
          term.write(msg.data);
          break;
        case "exit":
          setStatus("exited");
          setDetail(`exited (code ${msg.code})`);
          onExitRef.current?.(msg.code);
          term.write(
            `\r\n\x1b[90m[process exited with code ${msg.code}]\x1b[0m\r\n`,
          );
          break;
        case "error":
          setStatus("error");
          setDetail(msg.message);
          term.write(`\r\n\x1b[31m[error] ${msg.message}\x1b[0m\r\n`);
          break;
      }
    };

    ws.onclose = () => {
      setStatus((s) => (s === "running" || s === "connecting" ? "exited" : s));
    };

    // Forward all terminal input to the PTY as stdin: typed keys, pastes, and
    // the protocol replies a full-screen TUI generates on its own.
    const dataSub = term.onData((data) => sendClient({ type: "stdin", data }));

    // Fire onFirstInput once per mount, on the first genuine keystroke — the
    // signal the user is actually working this session, not just viewing it.
    // Deliberately keyed off `onKey`, not `onData`: `onData` also fires for
    // machine-generated sequences (cursor-position / device-attribute replies,
    // mouse and focus tracking) that the TUI emits unprompted — and the `replay`
    // write above can provoke them — so keying off `onData` would spuriously
    // un-park a WIP ticket merely from opening it to read. `onKey` fires only on
    // real key presses, keeping WIP a glance-safe parking lot.
    let firstKey = true;
    const keySub = term.onKey(() => {
      if (!firstKey) return;
      firstKey = false;
      onFirstInputRef.current?.();
    });

    const refit = () => {
      try {
        fit.fit();
        sendClient({ type: "resize", cols: term.cols, rows: term.rows });
      } catch {
        // ignore transient fit errors
      }
    };
    window.addEventListener("resize", refit);
    const ro = new ResizeObserver(refit);
    ro.observe(container);
    // initial resize once the WS is open
    const initialResize = setTimeout(refit, 50);
    term.focus();

    return () => {
      clearTimeout(initialResize);
      window.removeEventListener("resize", refit);
      ro.disconnect();
      dataSub.dispose();
      keySub.dispose();
      ws.close();
      term.dispose();
      wsRef.current = null;
    };
  }, [sessionDbId, resume]);

  // `status` here is the WS *connection* status (a separate space from the DB
  // SessionStatus the board renders), so it maps locally. The hook-driven
  // `activity` overlays a running session: a spinner only when a hook confirms
  // "busy", the amber "your turn" dot when "awaiting", and otherwise the
  // classic green running dot (we don't guess without a hook).
  const awaiting = status === "running" && activity === "awaiting";
  const busy = status === "running" && activity === "busy";
  const showSpinner = status === "connecting" || busy;
  const statusColor = awaiting
    ? "bg-warn"
    : status === "error"
      ? "bg-danger"
      : status === "running"
        ? "bg-ok"
        : "bg-idle";
  const statusText = awaiting ? "awaiting input" : busy ? "working" : status;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted">
          {showSpinner ? (
            <Spinner />
          ) : (
            <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
          )}
          <span className="sr-only">
            {statusText}
            {detail ? `, ${detail}` : ""}
          </span>
          <span aria-hidden="true">{statusText}</span>
          {detail && (
            <span className="text-faint" aria-hidden="true">
              · {detail}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === "error" && onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          {(status === "running" || status === "connecting") && (
            <Button
              variant="destructive"
              size="sm"
              onClick={sendKill}
              aria-label="Stop agent process"
              icon={<StopIcon size={ICON_SIZE_SM} />}
            >
              Kill
            </Button>
          )}
          {actions}
        </div>
      </div>
      <div
        ref={containerRef}
        className="terminal-container min-h-[480px] w-full flex-1 overflow-hidden rounded-md border border-line bg-[#1e1e1e] p-2 lg:min-h-0"
      />
    </div>
  );
}
