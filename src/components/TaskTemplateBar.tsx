"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { executeTaskTemplate } from "@/actions/templates";
import type { TaskTemplate } from "@/db/schema";
import { AGENT_LABELS } from "@/lib/agent-display";
import { cardClass } from "@/lib/ui-classes";
import Button from "@/components/ui/Button";
import { ICON_SIZE_SM, StartIcon } from "@/components/ui/icons";

export default function TaskTemplateBar({
  templates,
}: {
  templates: TaskTemplate[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (templates.length === 0) return null;

  function run(template: TaskTemplate) {
    setError(null);
    setRunningId(template.id);
    startTransition(async () => {
      try {
        const { ticketId, sessionDbId } = await executeTaskTemplate(template.id);
        router.push(`/tickets/${ticketId}?session=${sessionDbId}`);
      } catch (err) {
        setError((err as Error).message);
        setRunningId(null);
      }
    });
  }

  return (
    <section className={cardClass("w-full p-3")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Routine templates</h2>
        <Link
          href="/settings#task-templates"
          className="text-xs text-muted underline hover:text-fg"
        >
          Manage
        </Link>
      </div>
      {error && (
        <p className="mb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface/50 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{template.name}</div>
              <div className="text-xs text-muted">
                {AGENT_LABELS[template.agent]}
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              disabled={runningId !== null}
              onClick={() => run(template)}
              icon={<StartIcon size={ICON_SIZE_SM} />}
            >
              {runningId === template.id ? "Starting…" : "Execute"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
