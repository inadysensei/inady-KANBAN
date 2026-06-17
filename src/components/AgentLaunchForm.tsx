"use client";

import Link from "next/link";
import type { ClaudeEffort, ClaudeModel } from "@/lib/agent-launch";
import {
  CLAUDE_EFFORTS,
  CLAUDE_MODELS,
  padAgentTeamMembers,
  parseAgentTeamMembers,
} from "@/lib/agent-launch";
import type { CursorModelChoices } from "@/lib/cursor-models";
import { cursorModelLabel, isKnownCursorModel } from "@/lib/cursor-models";
import { AGENT_KINDS, type AgentKind } from "@/db/schema";
import { AGENT_LABELS, AGENT_LOGOS } from "@/lib/agent-display";
import type { TeamTemplate } from "@/db/schema";
import { inputClass } from "@/lib/ui-classes";

const MIN_TEAM_SLOTS = 3;

export type AgentLaunchValues = {
  agent: AgentKind;
  prompt: string;
  claudeModel: ClaudeModel;
  claudeEffort: ClaudeEffort;
  /** Combined cursor model id (effort baked in). Only used when agent==="cursor". */
  cursorModel: string;
  useAgentTeam: boolean;
  agentTeamMembers: string[];
  /** Launch the CLI in an isolated git worktree (`--worktree`, both CLIs). */
  worktree: boolean;
};

export function emptyTeamSlots(count = MIN_TEAM_SLOTS): string[] {
  return Array.from({ length: count }, () => "");
}

export default function AgentLaunchForm({
  idPrefix,
  values,
  onChange,
  claudeDefaults,
  cursorModelChoices,
  teamTemplates,
  agents = AGENT_KINDS,
  settingsHref = "/settings",
  promptLabel = "Prompt",
  promptRows = 4,
  showWorktree = true,
}: {
  idPrefix: string;
  values: AgentLaunchValues;
  onChange: (next: AgentLaunchValues) => void;
  claudeDefaults: { model: ClaudeModel; effort: ClaudeEffort };
  cursorModelChoices: CursorModelChoices;
  teamTemplates: TeamTemplate[];
  /** Tools to offer, in display order — the enabled ones from Settings.
   *  Defaults to every kind so callers that don't thread the setting still work. */
  agents?: AgentKind[];
  settingsHref?: string;
  promptLabel?: string;
  promptRows?: number;
  /** Whether to show the "worktree" toggle. Off for saved templates, which
   *  never persist worktree (it's a deliberate per-launch opt-in). */
  showWorktree?: boolean;
}) {
  function patch(partial: Partial<AgentLaunchValues>) {
    onChange({ ...values, ...partial });
  }

  function setMember(index: number, value: string) {
    const next = [...values.agentTeamMembers];
    next[index] = value;
    patch({ agentTeamMembers: next });
  }

  function addMemberSlot() {
    patch({ agentTeamMembers: [...values.agentTeamMembers, ""] });
  }

  function applyTeamTemplate(templateId: string) {
    const template = teamTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const parsed = parseAgentTeamMembers(template.members);
    patch({
      useAgentTeam: true,
      agentTeamMembers: padAgentTeamMembers(parsed, MIN_TEAM_SLOTS),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold text-muted">Agent</legend>
        <div className="flex flex-wrap gap-3">
          {agents.map((agent) => (
            <label
              key={agent}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg transition-colors has-checked:border-accent has-checked:bg-accent/10"
            >
              <input
                type="radio"
                name={`${idPrefix}-agent`}
                value={agent}
                checked={values.agent === agent}
                onChange={() =>
                  patch({
                    agent,
                    claudeModel:
                      values.claudeModel || claudeDefaults.model,
                    claudeEffort:
                      values.claudeEffort || claudeDefaults.effort,
                    cursorModel:
                      values.cursorModel || cursorModelChoices.default,
                  })
                }
                className="accent-accent"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AGENT_LOGOS[agent]} alt="" className="h-[18px] w-[18px]" />
              {AGENT_LABELS[agent]}
            </label>
          ))}
        </div>
      </fieldset>

      {values.agent === "claude" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-muted">Model</span>
            <select
              value={values.claudeModel}
              onChange={(e) =>
                patch({ claudeModel: e.target.value as ClaudeModel })
              }
              className={inputClass()}
            >
              {CLAUDE_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-muted">Effort</span>
            <select
              value={values.claudeEffort}
              onChange={(e) =>
                patch({ claudeEffort: e.target.value as ClaudeEffort })
              }
              className={inputClass()}
            >
              {CLAUDE_EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {values.agent === "cursor" && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted">Model</span>
          <select
            value={values.cursorModel}
            onChange={(e) => patch({ cursorModel: e.target.value })}
            className={inputClass()}
          >
            {/* Keep the current value selectable even if it's no longer in the
                enabled set (e.g. a template pinned a since-removed model). */}
            {!cursorModelChoices.options.some(
              (o) => o.id === values.cursorModel,
            ) &&
              values.cursorModel && (
                <option value={values.cursorModel}>
                  {cursorModelLabel(values.cursorModel)}
                  {isKnownCursorModel(values.cursorModel)
                    ? ""
                    : " (unavailable)"}
                </option>
              )}
            {cursorModelChoices.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {isKnownCursorModel(option.id) ? "" : " (unavailable)"}
              </option>
            ))}
          </select>
        </label>
      )}

      {showWorktree && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.worktree}
            onChange={(e) => patch({ worktree: e.target.checked })}
            className="accent-accent"
          />
          worktree
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.useAgentTeam}
          onChange={(e) =>
            patch({
              useAgentTeam: e.target.checked,
              agentTeamMembers: e.target.checked
                ? values.agentTeamMembers.length >= MIN_TEAM_SLOTS
                  ? values.agentTeamMembers
                  : emptyTeamSlots()
                : values.agentTeamMembers,
            })
          }
          className="accent-accent"
        />
        Agent Team
      </label>

      {values.useAgentTeam && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">
              Team members
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {teamTemplates.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) applyTeamTemplate(e.target.value);
                    e.target.value = "";
                  }}
                  className={inputClass("w-auto text-xs")}
                  aria-label="Apply team template"
                >
                  <option value="">Team template…</option>
                  {teamTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <Link
                href={settingsHref}
                className="text-xs text-muted underline hover:text-fg"
              >
                Manage templates
              </Link>
            </div>
          </div>
          {values.agentTeamMembers.map((member, index) => (
            <input
              key={index}
              type="text"
              value={member}
              onChange={(e) => setMember(index, e.target.value)}
              placeholder={`Agent ${index + 1}`}
              aria-label={`Agent team member ${index + 1}`}
              className={inputClass()}
            />
          ))}
          <button
            type="button"
            onClick={addMemberSlot}
            className="self-start rounded-sm text-xs text-muted underline hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Add member
          </button>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold text-muted">{promptLabel}</span>
        <textarea
          value={values.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
          rows={promptRows}
          aria-label={promptLabel}
          className={inputClass("font-mono text-xs")}
        />
      </label>
    </div>
  );
}

export function AgentLaunchFormReadonlySummary({
  values,
}: {
  values: Pick<
    AgentLaunchValues,
    | "agent"
    | "claudeModel"
    | "claudeEffort"
    | "cursorModel"
    | "useAgentTeam"
    | "agentTeamMembers"
  >;
}) {
  return (
    <ul className="text-xs text-muted">
      <li>Agent: {AGENT_LABELS[values.agent]}</li>
      {values.agent === "claude" && (
        <li>
          Claude: {values.claudeModel} / {values.claudeEffort}
        </li>
      )}
      {values.agent === "cursor" && values.cursorModel && (
        <li>Cursor: {cursorModelLabel(values.cursorModel)}</li>
      )}
      {values.useAgentTeam && (
        <li>
          Team:{" "}
          {values.agentTeamMembers.filter((m) => m.trim()).join(", ") || "—"}
        </li>
      )}
    </ul>
  );
}
