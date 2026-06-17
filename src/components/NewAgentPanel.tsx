"use client";

import { useState, useTransition } from "react";
import { createAgentSession } from "@/actions/sessions";
import type { ClaudeEffort, ClaudeModel } from "@/lib/agent-launch";
import type { CursorModelChoices } from "@/lib/cursor-models";
import type { AgentKind, TeamTemplate } from "@/db/schema";
import { AGENT_KINDS } from "@/db/schema";
import { cardClass } from "@/lib/ui-classes";
import Button from "@/components/ui/Button";
import { ICON_SIZE_SM, StartIcon } from "@/components/ui/icons";
import AgentLaunchForm, {
  emptyTeamSlots,
  type AgentLaunchValues,
} from "./AgentLaunchForm";

const DEFAULT_PROMPT = "Implement this.";

export default function NewAgentPanel({
  ticketId,
  claudeDefaults,
  cursorModelChoices,
  teamTemplates,
  agents = AGENT_KINDS,
  onStarted,
}: {
  ticketId: string;
  claudeDefaults: { model: ClaudeModel; effort: ClaudeEffort };
  cursorModelChoices: CursorModelChoices;
  teamTemplates: TeamTemplate[];
  /** Enabled tools (Settings), in display order. */
  agents?: AgentKind[];
  onStarted: (sessionDbId: string) => void;
}) {
  const [values, setValues] = useState<AgentLaunchValues>({
    agent: agents[0] ?? "cursor",
    prompt: DEFAULT_PROMPT,
    claudeModel: claudeDefaults.model,
    claudeEffort: claudeDefaults.effort,
    cursorModel: cursorModelChoices.default,
    useAgentTeam: false,
    agentTeamMembers: emptyTeamSlots(),
    worktree: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!values.prompt.trim()) {
      setError("Enter a prompt first");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const members = values.useAgentTeam
          ? values.agentTeamMembers.filter((m) => m.trim())
          : [];
        const { sessionDbId } = await createAgentSession(ticketId, {
          agent: values.agent,
          basePrompt: values.prompt,
          agentTeamMembers: members,
          claudeModel:
            values.agent === "claude" ? values.claudeModel : undefined,
          claudeEffort:
            values.agent === "claude" ? values.claudeEffort : undefined,
          cursorModel:
            values.agent === "cursor" ? values.cursorModel : undefined,
          worktree: values.worktree,
        });
        setValues((prev) => ({ ...prev, prompt: DEFAULT_PROMPT }));
        onStarted(sessionDbId);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className={cardClass("flex flex-col gap-2 p-3")}>
      <h3 className="text-sm font-semibold">New agent</h3>
      <AgentLaunchForm
        idPrefix="new-agent"
        values={values}
        onChange={setValues}
        claudeDefaults={claudeDefaults}
        cursorModelChoices={cursorModelChoices}
        teamTemplates={teamTemplates}
        agents={agents}
        settingsHref="/settings#team-templates"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button
        disabled={pending}
        onClick={run}
        icon={<StartIcon size={ICON_SIZE_SM} />}
      >
        {pending ? "Starting…" : "Run agent"}
      </Button>
    </div>
  );
}
