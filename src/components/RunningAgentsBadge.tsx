"use client";

import { useEffect, useState } from "react";
import {
  fetchLiveAgentCount,
  type LiveAgentCount,
} from "@/lib/agent-session-api";
import { badgeClass, type BadgeTone } from "@/lib/ui-classes";

export default function RunningAgentsBadge() {
  const [count, setCount] = useState<LiveAgentCount | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const next = await fetchLiveAgentCount();
      if (!cancelled) setCount(next);
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const live = count?.live ?? null;
  const max = count?.max ?? null;
  const atLimit = live !== null && max !== null && live >= max;

  const tone: BadgeTone =
    count === null
      ? "neutral"
      : atLimit
        ? "warn"
        : live! > 0
          ? "ok"
          : "neutral";

  return (
    <span
      className={badgeClass(tone)}
      title="Live cursor-agent PTY processes (server registry)"
      aria-live="polite"
    >
      {count === null
        ? "Agents …"
        : `Agents ${live} / ${max}`}
    </span>
  );
}
