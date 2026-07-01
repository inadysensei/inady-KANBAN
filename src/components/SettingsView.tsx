"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AUTO_SAVE_DELAY_MS, useAutoSave } from "@/lib/use-auto-save";
import {
  deleteTaskTemplate,
  deleteTeamTemplate,
  saveAgentTools,
  saveClaudeDefaults,
  saveClineDefaults,
  saveClineModels,
  saveCursorModels,
  saveDateFormat,
  saveTaskTemplate,
  saveTeamTemplate,
} from "@/actions/settings";
import {
  addRepository,
  pickRepositoryDirectory,
  removeRepository,
  updateRepository,
} from "@/actions/repositories";
import {
  deleteEditor,
  saveEditor,
  setDefaultEditor,
} from "@/actions/editors";
import { deleteTag, saveTag } from "@/actions/tags";
import type {
  AgentKind,
  Editor,
  Repository,
  Tag,
  TaskTemplate,
  TeamTemplate,
} from "@/db/schema";
import type { ClaudeEffort, ClaudeModel, ClineEffort } from "@/lib/agent-launch";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, CLINE_EFFORTS } from "@/lib/agent-launch";
import type { AgentToolSetting } from "@/lib/agent-tools";
import {
  enabledAgents,
  moveAgentTool,
  setAgentToolEnabled,
} from "@/lib/agent-tools";
import type {
  CursorModelChoices,
  CursorModelSelectionEntry,
} from "@/lib/cursor-models";
import {
  addCursorModel,
  availableCursorModelsToAdd,
  cursorModelLabel,
  cursorModelOptions,
  defaultCursorModel,
  isKnownCursorModel,
  moveCursorModel,
  removeCursorModel,
  setDefaultCursorModel,
} from "@/lib/cursor-models";
import type {
  ClineModelChoices,
  ClineModelSelectionEntry,
} from "@/lib/cline-models";
import {
  addClineModel,
  availableClineModelsToAdd,
  clineModelLabel,
  clineModelOptions,
  defaultClineModel,
  isKnownClineModel,
  moveClineModel,
  removeClineModel,
  setDefaultClineModel,
} from "@/lib/cline-models";
import { isValidTagColor, normalizeTagColor } from "@/lib/tags";
import TagBadge from "@/components/TagBadge";
import { AGENT_LABELS, AGENT_LOGOS } from "@/lib/agent-display";
import {
  DATE_FORMATS,
  type DateFormat,
  formatDate,
} from "@/lib/date-format";
import {
  padAgentTeamMembers,
  parseAgentTeamMembers,
} from "@/lib/agent-launch";
import AgentLaunchForm, {
  emptyTeamSlots,
  type AgentLaunchValues,
} from "@/components/AgentLaunchForm";
import { buttonClass, cardClass, inputClass } from "@/lib/ui-classes";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import {
  AddIcon,
  CheckIcon,
  EditIcon,
  ICON_SIZE_SM,
  MoveDownIcon,
  MoveUpIcon,
  TrashIcon,
} from "@/components/ui/icons";

function parseMembers(raw: string): string[] {
  return padAgentTeamMembers(parseAgentTeamMembers(raw));
}

function TaskTemplateEditor({
  template,
  workingDirs,
  claudeDefaults,
  cursorModelChoices,
  clineModelChoices,
  clineDefaults,
  teamTemplates,
  agents,
  onCancel,
}: {
  template?: TaskTemplate;
  workingDirs: string[];
  claudeDefaults: { model: ClaudeModel; effort: ClaudeEffort };
  cursorModelChoices: CursorModelChoices;
  clineModelChoices: ClineModelChoices;
  clineDefaults: { effort: ClineEffort };
  teamTemplates: TeamTemplate[];
  agents: AgentKind[];
  onCancel: () => void;
}) {
  const [recordId, setRecordId] = useState(template?.id);
  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [workingDir, setWorkingDir] = useState(
    template?.workingDir ?? workingDirs[0] ?? "",
  );
  const [launch, setLaunch] = useState<AgentLaunchValues>({
    // Only seed an agent that's actually offered — a template pinned to a tool
    // later disabled in Settings would otherwise leave the radio group with no
    // selection (and show orphaned Claude controls).
    agent:
      template?.agent && agents.includes(template.agent)
        ? template.agent
        : agents[0] ?? "cursor",
    prompt: template?.mainPrompt ?? "",
    claudeModel:
      (template?.claudeModel as ClaudeModel | null) ?? claudeDefaults.model,
    claudeEffort:
      (template?.claudeEffort as ClaudeEffort | null) ?? claudeDefaults.effort,
    cursorModel: template?.cursorModel ?? cursorModelChoices.default,
    clineModel: template?.clineModel ?? clineModelChoices.default,
    clineEffort:
      (template?.clineEffort as AgentLaunchValues["clineEffort"] | null) ??
      clineDefaults.effort,
    useAgentTeam: template?.useAgentTeam ?? false,
    agentTeamMembers: template
      ? parseMembers(template.agentTeamMembers)
      : emptyTeamSlots(),
    // Templates never carry a worktree choice — it's a per-launch opt-in only.
    worktree: false,
  });
  const savePayload = useMemo(
    () => ({
      id: recordId,
      name,
      title,
      description,
      workingDir,
      agent: launch.agent,
      mainPrompt: launch.prompt,
      useAgentTeam: launch.useAgentTeam,
      agentTeamMembers: launch.useAgentTeam
        ? launch.agentTeamMembers.filter((m) => m.trim())
        : [],
      claudeModel: launch.agent === "claude" ? launch.claudeModel : null,
      claudeEffort: launch.agent === "claude" ? launch.claudeEffort : null,
      cursorModel: launch.agent === "cursor" ? launch.cursorModel : null,
      clineModel: launch.agent === "cline" ? launch.clineModel : null,
      clineEffort: launch.agent === "cline" ? launch.clineEffort : null,
    }),
    [recordId, name, title, description, workingDir, launch],
  );

  const { error, pending } = useAutoSave(
    savePayload,
    async (payload) => {
      const result = await saveTaskTemplate(payload);
      if (!payload.id) setRecordId(result.id);
    },
    {
      delayMs: AUTO_SAVE_DELAY_MS,
      skip: (p) =>
        !p.name.trim() ||
        !p.title.trim() ||
        !p.mainPrompt.trim() ||
        !p.workingDir.trim(),
    },
  );

  return (
    <div className={cardClass("flex flex-col gap-3 p-4")}>
      <h3 className="text-sm font-semibold">
        {template ? "Edit task template" : "New task template"}
      </h3>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Template name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass()}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Ticket title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass()}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Ticket description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputClass()}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Working directory</span>
        <select
          value={workingDir}
          onChange={(e) => setWorkingDir(e.target.value)}
          className={inputClass()}
        >
          {workingDirs.map((dir) => (
            <option key={dir} value={dir}>
              {dir}
            </option>
          ))}
        </select>
      </label>
      <AgentLaunchForm
        idPrefix="task-template"
        values={launch}
        onChange={setLaunch}
        claudeDefaults={claudeDefaults}
        cursorModelChoices={cursorModelChoices}
        clineModelChoices={clineModelChoices}
        clineDefaults={clineDefaults}
        teamTemplates={teamTemplates}
        agents={agents}
        settingsHref="/settings#team-templates"
        promptLabel="Main prompt"
        showWorktree={false}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={buttonClass({ variant: "secondary" })}
        >
          {pending ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}

function TeamTemplateEditor({
  template,
  onCancel,
}: {
  template?: TeamTemplate;
  onCancel: () => void;
}) {
  const [recordId, setRecordId] = useState(template?.id);
  const [name, setName] = useState(template?.name ?? "");
  const [members, setMembers] = useState<string[]>(
    template ? parseMembers(template.members) : emptyTeamSlots(),
  );

  const savePayload = useMemo(
    () => ({
      id: recordId,
      name,
      members: members.filter((m) => m.trim()),
    }),
    [recordId, name, members],
  );

  const { error, pending } = useAutoSave(
    savePayload,
    async (payload) => {
      const result = await saveTeamTemplate(payload);
      if (!payload.id) setRecordId(result.id);
    },
    {
      delayMs: AUTO_SAVE_DELAY_MS,
      skip: (p) => !p.name.trim(),
    },
  );

  return (
    <div className={cardClass("flex flex-col gap-3 p-4")}>
      <h3 className="text-sm font-semibold">
        {template ? "Edit team template" : "New team template"}
      </h3>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass()}
        />
      </label>
      {members.map((member, index) => (
        <input
          key={index}
          type="text"
          value={member}
          onChange={(e) => {
            const next = [...members];
            next[index] = e.target.value;
            setMembers(next);
          }}
          placeholder={`Member ${index + 1}`}
          className={inputClass()}
        />
      ))}
      <button
        type="button"
        onClick={() => setMembers([...members, ""])}
        className="self-start rounded-sm text-xs text-muted underline hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        Add member
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={buttonClass({ variant: "secondary" })}
        >
          {pending ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}

function RepositoryEditor({
  repository,
  onCancel,
}: {
  repository?: Repository;
  onCancel: () => void;
}) {
  const [recordId, setRecordId] = useState(repository?.id);
  const [path, setPath] = useState(repository?.path ?? "");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browsePending, startBrowse] = useTransition();

  const savePayload = useMemo(
    () => ({ id: recordId, path }),
    [recordId, path],
  );

  const { error: saveError, pending: savePending } = useAutoSave(
    savePayload,
    async (payload) => {
      const trimmed = payload.path.trim();
      if (!trimmed) return;
      if (payload.id) {
        await updateRepository(payload.id, trimmed);
      } else {
        const result = await addRepository(trimmed);
        setRecordId(result.id);
      }
    },
    {
      delayMs: AUTO_SAVE_DELAY_MS,
      enabled: !browsing,
      skip: (p) => !p.path.trim(),
    },
  );

  function browse() {
    setBrowseError(null);
    setBrowsing(true);
    startBrowse(async () => {
      try {
        const result = await pickRepositoryDirectory();
        if (!("canceled" in result)) setPath(result.path);
      } catch (err) {
        setBrowseError((err as Error).message);
      } finally {
        setBrowsing(false);
      }
    });
  }

  const error = browseError ?? saveError;
  const pending = browsePending || savePending;

  return (
    <div className={cardClass("flex flex-col gap-2 p-4")}>
      <h3 className="text-sm font-semibold">
        {repository ? "Edit working directory" : "Add working directory"}
      </h3>
      <p className="text-xs text-muted">
        Type an absolute path, or browse for a folder (macOS).
      </p>
      <div className="flex gap-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/absolute/path/to/project"
          aria-label="Working directory path"
          className={inputClass("flex-1 font-mono text-sm")}
        />
        <button
          type="button"
          disabled={pending}
          onClick={browse}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          {browsing ? "Choosing…" : "Browse…"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={buttonClass({ variant: "secondary" })}
        >
          {pending ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}

function EditorEditor({
  editor,
  onCancel,
}: {
  editor?: Editor;
  onCancel: () => void;
}) {
  const [recordId, setRecordId] = useState(editor?.id);
  const [name, setName] = useState(editor?.name ?? "");
  const [command, setCommand] = useState(editor?.command ?? "");
  const [isDefault, setIsDefault] = useState(editor?.isDefault ?? false);

  const savePayload = useMemo(
    () => ({ id: recordId, name, command, isDefault }),
    [recordId, name, command, isDefault],
  );

  const { error, pending } = useAutoSave(
    savePayload,
    async (payload) => {
      const result = await saveEditor(payload);
      if (!payload.id) setRecordId(result.id);
    },
    {
      delayMs: AUTO_SAVE_DELAY_MS,
      skip: (p) => !p.name.trim() || !p.command.trim(),
    },
  );

  return (
    <div className={cardClass("flex flex-col gap-3 p-4")}>
      <h3 className="text-sm font-semibold">
        {editor ? "Edit editor" : "New editor"}
      </h3>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VS Code"
          className={inputClass()}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Command</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="code ."
          className={inputClass("font-mono text-sm")}
        />
        <span className="text-muted">
          Runs in the ticket&apos;s working dir; <code className="font-mono">.</code>{" "}
          is that folder. The binary must be on the server&apos;s PATH.
        </span>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        <span className="font-semibold">Default editor</span>
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={buttonClass({ variant: "secondary" })}
        >
          {pending ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}

/** A sensible starting color for a brand-new tag (a neutral blue). */
const NEW_TAG_COLOR = "#3b82f6";

function TagEditor({
  tag,
  onCancel,
}: {
  tag?: Tag;
  onCancel: () => void;
}) {
  const [recordId, setRecordId] = useState(tag?.id);
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? NEW_TAG_COLOR);

  const colorValid = isValidTagColor(color);
  const trimmedName = name.trim();
  // The native picker only speaks 6-digit hex; feed it the normalized value (or
  // a placeholder while the text field is mid-edit / invalid).
  const swatchColor = colorValid ? normalizeTagColor(color) : "#000000";

  const savePayload = useMemo(
    () => ({ id: recordId, name, color }),
    [recordId, name, color],
  );

  const { error, pending } = useAutoSave(
    savePayload,
    async (payload) => {
      const result = await saveTag(payload);
      if (!payload.id) setRecordId(result.id);
    },
    {
      delayMs: AUTO_SAVE_DELAY_MS,
      skip: (p) => !isValidTagColor(p.color) || !p.name.trim(),
    },
  );

  return (
    <div className={cardClass("flex flex-col gap-3 p-4")}>
      <h3 className="text-sm font-semibold">{tag ? "Edit tag" : "New tag"}</h3>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="High"
          className={inputClass()}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold">Color</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={swatchColor}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Pick color"
            className="h-9 w-12 shrink-0 cursor-pointer rounded-sm border border-line-strong bg-surface"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#rrggbb"
            aria-label="Color hex code"
            className={inputClass("font-mono")}
          />
          {colorValid && trimmedName && (
            <TagBadge tag={{ name: trimmedName, color: swatchColor }} />
          )}
        </div>
        <span className="text-muted">
          A hex code starting with <code className="font-mono">#</code> (e.g.{" "}
          <code className="font-mono">#ef4444</code>).
        </span>
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={buttonClass({ variant: "secondary" })}
        >
          {pending ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}

/** A fixed sample date for the format preview — constant (not `now`) so the
 *  preview is deterministic and SSR/hydration agree. */
const DATE_PREVIEW_TS = new Date(2026, 0, 31).getTime();

export default function SettingsView({
  claudeDefaults,
  cursorModelSelection,
  clineModelSelection,
  clineDefaults,
  dateFormat,
  agentTools,
  taskTemplates,
  teamTemplates,
  workingDirs,
  repositories,
  editors,
  tags,
}: {
  claudeDefaults: { model: ClaudeModel; effort: ClaudeEffort };
  cursorModelSelection: CursorModelSelectionEntry[];
  clineModelSelection: ClineModelSelectionEntry[];
  clineDefaults: { effort: ClineEffort };
  dateFormat: DateFormat;
  agentTools: AgentToolSetting[];
  taskTemplates: TaskTemplate[];
  teamTemplates: TeamTemplate[];
  workingDirs: string[];
  repositories: Repository[];
  editors: Editor[];
  tags: Tag[];
}) {
  const router = useRouter();
  const [model, setModel] = useState(claudeDefaults.model);
  const [effort, setEffort] = useState(claudeDefaults.effort);
  const claudeSavePayload = useMemo(() => ({ model, effort }), [model, effort]);
  const { error: defaultsError, pending: defaultsPending } = useAutoSave(
    claudeSavePayload,
    saveClaudeDefaults,
    { delayMs: 300 },
  );
  const [tools, setTools] = useState(agentTools);
  const { error: toolsError, pending: toolsPending } = useAutoSave(
    tools,
    saveAgentTools,
    { skip: (t) => !t.some((tool) => tool.enabled), delayMs: 300 },
  );
  const noToolEnabled = !tools.some((t) => t.enabled);
  const enabledTemplateAgents = enabledAgents(agentTools);
  // Live (unsaved) enabled set: gates each tool's settings sections below, so
  // ticking/unticking a tool in "AI tools" shows/hides its settings immediately
  // (vs. enabledTemplateAgents, which uses the SAVED list for the template form).
  const enabledNow = new Set(enabledAgents(tools));

  // Cursor models: the curated/ordered selection shown in the launch form. The
  // full catalog lives client-side (cursor-models.ts), so the "add" dropdown and
  // labels resolve without a prop.
  const [cursorModels, setCursorModels] = useState(cursorModelSelection);
  const { error: cursorModelsError, pending: cursorModelsPending } =
    useAutoSave(cursorModels, saveCursorModels, { delayMs: 300 });
  const cursorModelsToAdd = availableCursorModelsToAdd(cursorModels);
  // What the task-template editor's launch form offers (the saved selection).
  const savedCursorChoices: CursorModelChoices = {
    options: cursorModelOptions(cursorModelSelection),
    default: defaultCursorModel(cursorModelSelection),
  };

  // Cline models: same curated/ordered-selection shape as cursor (the clinepass
  // catalog lives client-side in cline-models.ts).
  const [clineModels, setClineModels] = useState(clineModelSelection);
  const { error: clineModelsError, pending: clineModelsPending } =
    useAutoSave(clineModels, saveClineModels, { delayMs: 300 });
  const clineModelsToAdd = availableClineModelsToAdd(clineModels);
  const savedClineChoices: ClineModelChoices = {
    options: clineModelOptions(clineModelSelection),
    default: defaultClineModel(clineModelSelection),
  };

  // Cline default effort: the board-level `--thinking` level new sessions seed
  // from (mirrors the Claude defaults; cline's model default rides the selection
  // above, so this is effort-only).
  const [clineEffortDefault, setClineEffortDefault] = useState(
    clineDefaults.effort,
  );
  const clineEffortPayload = useMemo(
    () => ({ effort: clineEffortDefault }),
    [clineEffortDefault],
  );
  const { error: clineDefaultsError, pending: clineDefaultsPending } =
    useAutoSave(clineEffortPayload, saveClineDefaults, { delayMs: 300 });
  const [dateFmt, setDateFmt] = useState(dateFormat);
  const { error: dateFmtError, pending: dateFmtPending } = useAutoSave(
    dateFmt,
    saveDateFormat,
    { delayMs: 300 },
  );
  const [editingTaskId, setEditingTaskId] = useState<string | "new" | null>(
    null,
  );
  const [editingTeamId, setEditingTeamId] = useState<string | "new" | null>(
    null,
  );
  const [editingRepoId, setEditingRepoId] = useState<string | "new" | null>(
    null,
  );
  const [editingEditorId, setEditingEditorId] = useState<string | "new" | null>(
    null,
  );
  const [editingTagId, setEditingTagId] = useState<string | "new" | null>(null);

  const editingTask =
    editingTaskId && editingTaskId !== "new"
      ? taskTemplates.find((t) => t.id === editingTaskId)
      : undefined;
  const editingTeam =
    editingTeamId && editingTeamId !== "new"
      ? teamTemplates.find((t) => t.id === editingTeamId)
      : undefined;
  const editingRepo =
    editingRepoId && editingRepoId !== "new"
      ? repositories.find((r) => r.id === editingRepoId)
      : undefined;
  const editingEditor =
    editingEditorId && editingEditorId !== "new"
      ? editors.find((e) => e.id === editingEditorId)
      : undefined;
  const editingTag =
    editingTagId && editingTagId !== "new"
      ? tags.find((t) => t.id === editingTagId)
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-[900px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/"
          className="w-fit text-sm text-muted hover:text-fg hover:underline"
        >
          ← inady KANBAN
        </Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <section id="ai-tools" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">AI tools</h2>
        <div className={cardClass("flex flex-col gap-3 p-4")}>
          <p className="text-xs text-muted">
            Which CLIs the New agent form and task templates can launch, and the
            order they appear in. Keep at least one enabled.
          </p>
          <ul className="flex max-w-md flex-col gap-2">
            {tools.map((tool, index) => (
              <li
                key={tool.agent}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tool.enabled}
                    onChange={(e) =>
                      setTools((prev) =>
                        setAgentToolEnabled(prev, index, e.target.checked),
                      )
                    }
                    className="accent-accent"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={AGENT_LOGOS[tool.agent]}
                    alt=""
                    className="h-[18px] w-[18px]"
                  />
                  <span className="font-medium">{AGENT_LABELS[tool.agent]}</span>
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="sm"
                    aria-label={`Move ${AGENT_LABELS[tool.agent]} up`}
                    disabled={index === 0}
                    onClick={() =>
                      setTools((prev) => moveAgentTool(prev, index, -1))
                    }
                  >
                    <MoveUpIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Move ${AGENT_LABELS[tool.agent]} down`}
                    disabled={index === tools.length - 1}
                    onClick={() =>
                      setTools((prev) => moveAgentTool(prev, index, 1))
                    }
                  >
                    <MoveDownIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
          {noToolEnabled && (
            <p className="text-xs text-danger">
              Select at least one AI tool.
            </p>
          )}
          {toolsError && <p className="text-xs text-danger">{toolsError}</p>}
          {toolsPending && <p className="text-xs text-muted">Saving…</p>}
        </div>
      </section>

      {enabledNow.has("claude") && (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Claude defaults</h2>
        <div className={cardClass("p-4")}>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold">Default model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ClaudeModel)}
                className={inputClass()}
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold">Default effort</span>
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value as ClaudeEffort)}
                className={inputClass()}
              >
                {CLAUDE_EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {defaultsError && (
            <p className="mt-2 text-xs text-danger">{defaultsError}</p>
          )}
          {defaultsPending && (
            <p className="mt-2 text-xs text-muted">Saving…</p>
          )}
        </div>
      </section>
      )}

      {enabledNow.has("cursor") && (
      <section id="cursor-models" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Cursor models</h2>
        <div className={cardClass("flex flex-col gap-3 p-4")}>
          <p className="text-xs text-muted">
            Which cursor models the New agent form and task templates offer, the
            order they appear in, and the default pick. Cursor bakes the effort
            into the model id, so each entry is one model × effort combination.
          </p>
          <ul className="flex max-w-md flex-col gap-2">
            {cursorModels.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cursor-default-model"
                    checked={entry.default}
                    onChange={() =>
                      setCursorModels((prev) =>
                        setDefaultCursorModel(prev, entry.id),
                      )
                    }
                    className="accent-accent"
                    aria-label={`Set ${cursorModelLabel(entry.id)} as default`}
                  />
                  <span className="truncate font-medium">
                    {cursorModelLabel(entry.id)}
                  </span>
                  {entry.default && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                      default
                    </span>
                  )}
                  {!isKnownCursorModel(entry.id) && (
                    <span
                      className="shrink-0 text-[10px] uppercase tracking-wide text-warn"
                      title="This model is no longer offered by cursor — remove it or pick another."
                    >
                      unavailable
                    </span>
                  )}
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="sm"
                    aria-label={`Move ${cursorModelLabel(entry.id)} up`}
                    disabled={index === 0}
                    onClick={() =>
                      setCursorModels((prev) => moveCursorModel(prev, index, -1))
                    }
                  >
                    <MoveUpIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Move ${cursorModelLabel(entry.id)} down`}
                    disabled={index === cursorModels.length - 1}
                    onClick={() =>
                      setCursorModels((prev) => moveCursorModel(prev, index, 1))
                    }
                  >
                    <MoveDownIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Remove ${cursorModelLabel(entry.id)}`}
                    disabled={cursorModels.length <= 1}
                    onClick={() =>
                      setCursorModels((prev) => removeCursorModel(prev, entry.id))
                    }
                  >
                    <TrashIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
          {/* The long catalog lives inside this dropdown, keeping the page short. */}
          <select
            value=""
            disabled={cursorModelsToAdd.length === 0}
            onChange={(e) => {
              const id = e.target.value;
              if (id) setCursorModels((prev) => addCursorModel(prev, id));
              e.target.value = "";
            }}
            className={inputClass("max-w-md")}
            aria-label="Add a cursor model"
          >
            <option value="">
              {cursorModelsToAdd.length === 0
                ? "All models added"
                : "+ Add a model…"}
            </option>
            {cursorModelsToAdd.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {cursorModelsError && (
            <p className="text-xs text-danger">{cursorModelsError}</p>
          )}
          {cursorModelsPending && (
            <p className="text-xs text-muted">Saving…</p>
          )}
        </div>
      </section>
      )}

      {enabledNow.has("cline") && (
      <section id="cline-models" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Cline models</h2>
        <div className={cardClass("flex flex-col gap-3 p-4")}>
          <p className="text-xs text-muted">
            Which clinepass models the New agent form and task templates offer,
            the order they appear in, and the default pick. The reasoning effort
            is a separate per-launch choice (Cline’s <code>--thinking</code>).
          </p>
          <ul className="flex max-w-md flex-col gap-2">
            {clineModels.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cline-default-model"
                    checked={entry.default}
                    onChange={() =>
                      setClineModels((prev) =>
                        setDefaultClineModel(prev, entry.id),
                      )
                    }
                    className="accent-accent"
                    aria-label={`Set ${clineModelLabel(entry.id)} as default`}
                  />
                  <span className="truncate font-medium">
                    {clineModelLabel(entry.id)}
                  </span>
                  {entry.default && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                      default
                    </span>
                  )}
                  {!isKnownClineModel(entry.id) && (
                    <span
                      className="shrink-0 text-[10px] uppercase tracking-wide text-warn"
                      title="This model is no longer offered by clinepass — remove it or pick another."
                    >
                      unavailable
                    </span>
                  )}
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="sm"
                    aria-label={`Move ${clineModelLabel(entry.id)} up`}
                    disabled={index === 0}
                    onClick={() =>
                      setClineModels((prev) => moveClineModel(prev, index, -1))
                    }
                  >
                    <MoveUpIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Move ${clineModelLabel(entry.id)} down`}
                    disabled={index === clineModels.length - 1}
                    onClick={() =>
                      setClineModels((prev) => moveClineModel(prev, index, 1))
                    }
                  >
                    <MoveDownIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Remove ${clineModelLabel(entry.id)}`}
                    disabled={clineModels.length <= 1}
                    onClick={() =>
                      setClineModels((prev) => removeClineModel(prev, entry.id))
                    }
                  >
                    <TrashIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
          {/* The long catalog lives inside this dropdown, keeping the page short. */}
          <select
            value=""
            disabled={clineModelsToAdd.length === 0}
            onChange={(e) => {
              const id = e.target.value;
              if (id) setClineModels((prev) => addClineModel(prev, id));
              e.target.value = "";
            }}
            className={inputClass("max-w-md")}
            aria-label="Add a cline model"
          >
            <option value="">
              {clineModelsToAdd.length === 0
                ? "All models added"
                : "+ Add a model…"}
            </option>
            {clineModelsToAdd.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {clineModelsError && (
            <p className="text-xs text-danger">{clineModelsError}</p>
          )}
          {clineModelsPending && (
            <p className="text-xs text-muted">Saving…</p>
          )}
        </div>
      </section>
      )}

      {enabledNow.has("cline") && (
      <section id="cline-defaults" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Cline default effort</h2>
        <div className={cardClass("flex flex-col gap-3 p-4")}>
          <p className="text-xs text-muted">
            The reasoning level (Cline’s <code>--thinking</code>) new Cline
            sessions and task templates start with. You can still change it per
            launch.
          </p>
          <label className="flex max-w-xs flex-col gap-1 text-xs">
            <span className="font-semibold text-muted">Default effort</span>
            <select
              value={clineEffortDefault}
              onChange={(e) =>
                setClineEffortDefault(e.target.value as ClineEffort)
              }
              className={inputClass()}
            >
              {CLINE_EFFORTS.map((eff) => (
                <option key={eff} value={eff}>
                  {eff}
                </option>
              ))}
            </select>
          </label>
          {clineDefaultsError && (
            <p className="text-xs text-danger">{clineDefaultsError}</p>
          )}
          {clineDefaultsPending && (
            <p className="text-xs text-muted">Saving…</p>
          )}
        </div>
      </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Date format</h2>
        <div className={cardClass("p-4")}>
          <label className="flex max-w-md flex-col gap-1 text-xs">
            <span className="font-semibold">
              How dates show on the board (created / done)
            </span>
            <select
              value={dateFmt}
              disabled={dateFmtPending}
              onChange={(e) => setDateFmt(e.target.value as DateFormat)}
              className={inputClass()}
            >
              {DATE_FORMATS.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt} — {formatDate(DATE_PREVIEW_TS, fmt)}
                </option>
              ))}
            </select>
          </label>
          {dateFmtError && (
            <p className="mt-2 text-xs text-danger">{dateFmtError}</p>
          )}
          {dateFmtPending && (
            <p className="mt-2 text-xs text-muted">Saving…</p>
          )}
        </div>
      </section>

      <section id="tags" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tags</h2>
          {!editingTagId && (
            <button
              type="button"
              onClick={() => setEditingTagId("new")}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Add tag
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Labels shown on tickets. The id is what the ticket-creation API takes
          (<code className="font-mono">tagIds</code>); unknown ids are skipped.
        </p>
        {editingTagId ? (
          <TagEditor
            key={editingTagId ?? undefined}
            tag={editingTag}
            onCancel={() => {
              setEditingTagId(null);
              router.refresh();
            }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TagBadge tag={tag} />
                  <code
                    className="break-all font-mono text-[11px] text-muted"
                    title="Tag id (use as tagIds in the create API)"
                  >
                    {tag.id}
                  </code>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="sm"
                    aria-label={`Edit ${tag.name}`}
                    onClick={() => setEditingTagId(tag.id)}
                  >
                    <EditIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    tone="danger"
                    aria-label={`Delete ${tag.name}`}
                    onClick={() => {
                      if (!window.confirm(`Delete "${tag.name}"?`)) return;
                      deleteTag(tag.id).then(() => router.refresh());
                    }}
                  >
                    <TrashIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
            {tags.length === 0 && (
              <p className="text-sm text-muted">
                No tags yet. Add one (e.g. a priority).
              </p>
            )}
          </ul>
        )}
      </section>

      <section id="working-directories" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Working directories</h2>
          {!editingRepoId && (
            <button
              type="button"
              onClick={() => setEditingRepoId("new")}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Add working directory
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          The directories the New ticket form and templates can target.
        </p>
        {editingRepoId ? (
          <RepositoryEditor
            key={editingRepoId ?? undefined}
            repository={editingRepo}
            onCancel={() => {
              setEditingRepoId(null);
              router.refresh();
            }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {repositories.map((repo) => (
              <li
                key={repo.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <code className="break-all font-mono text-xs text-fg">
                  {repo.path}
                </code>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="sm"
                    aria-label={`Edit ${repo.path}`}
                    onClick={() => setEditingRepoId(repo.id)}
                  >
                    <EditIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    tone="danger"
                    aria-label={`Remove ${repo.path}`}
                    onClick={() => {
                      if (!window.confirm(`Remove "${repo.path}"?`)) return;
                      removeRepository(repo.id).then(() => router.refresh());
                    }}
                  >
                    <TrashIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
            {repositories.length === 0 && (
              <p className="text-sm text-muted">
                No working directories yet. Add one to create tickets.
              </p>
            )}
          </ul>
        )}
      </section>

      <section id="editors" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Open-with editors</h2>
          {!editingEditorId && (
            <button
              type="button"
              onClick={() => setEditingEditorId("new")}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Add editor
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          The “Open with” split button on a ticket. The default is the primary
          action; the rest live behind its ▾ caret.
        </p>
        {editingEditorId ? (
          <EditorEditor
            key={editingEditorId ?? undefined}
            editor={editingEditor}
            onCancel={() => {
              setEditingEditorId(null);
              router.refresh();
            }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {editors.map((editor) => (
              <li
                key={editor.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {editor.name}
                    {editor.isDefault && (
                      <span className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-muted">
                        default
                      </span>
                    )}
                  </div>
                  <code className="break-all font-mono text-xs text-muted">
                    {editor.command}
                  </code>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!editor.isDefault && (
                    <IconButton
                      size="sm"
                      aria-label={`Make ${editor.name} the default editor`}
                      title="Make default"
                      onClick={() =>
                        setDefaultEditor(editor.id).then(() => router.refresh())
                      }
                    >
                      <CheckIcon size={ICON_SIZE_SM} />
                    </IconButton>
                  )}
                  <IconButton
                    size="sm"
                    aria-label={`Edit ${editor.name}`}
                    onClick={() => setEditingEditorId(editor.id)}
                  >
                    <EditIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    tone="danger"
                    aria-label={`Delete ${editor.name}`}
                    onClick={() => {
                      if (!window.confirm(`Delete "${editor.name}"?`)) return;
                      deleteEditor(editor.id).then(() => router.refresh());
                    }}
                  >
                    <TrashIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
            {editors.length === 0 && (
              <p className="text-sm text-muted">No editors yet.</p>
            )}
          </ul>
        )}
      </section>

      <section id="task-templates" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Task templates</h2>
          {!editingTaskId && (
            <button
              type="button"
              onClick={() => setEditingTaskId("new")}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Add template
            </button>
          )}
        </div>
        {editingTaskId ? (
          <TaskTemplateEditor
            key={editingTaskId ?? undefined}
            template={editingTask}
            workingDirs={workingDirs}
            claudeDefaults={claudeDefaults}
            cursorModelChoices={savedCursorChoices}
            clineModelChoices={savedClineChoices}
            clineDefaults={clineDefaults}
            teamTemplates={teamTemplates}
            agents={enabledTemplateAgents}
            onCancel={() => {
              setEditingTaskId(null);
              router.refresh();
            }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {taskTemplates.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{template.name}</div>
                  <div className="text-xs text-muted">{template.title}</div>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton
                    size="sm"
                    aria-label={`Edit ${template.name}`}
                    onClick={() => setEditingTaskId(template.id)}
                  >
                    <EditIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    tone="danger"
                    aria-label={`Delete ${template.name}`}
                    onClick={() => {
                      if (!window.confirm(`Delete "${template.name}"?`)) return;
                      deleteTaskTemplate(template.id).then(() => router.refresh());
                    }}
                  >
                    <TrashIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
            {taskTemplates.length === 0 && (
              <p className="text-sm text-muted">No task templates yet.</p>
            )}
          </ul>
        )}
      </section>

      <section id="team-templates" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Agent team templates</h2>
          {!editingTeamId && (
            <button
              type="button"
              onClick={() => setEditingTeamId("new")}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Add team template
            </button>
          )}
        </div>
        {editingTeamId ? (
          <TeamTemplateEditor
            key={editingTeamId ?? undefined}
            template={editingTeam}
            onCancel={() => {
              setEditingTeamId(null);
              router.refresh();
            }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {teamTemplates.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-2"
              >
                <div className="text-sm font-medium">{template.name}</div>
                <div className="flex items-center gap-1">
                  <IconButton
                    size="sm"
                    aria-label={`Edit ${template.name}`}
                    onClick={() => setEditingTeamId(template.id)}
                  >
                    <EditIcon size={ICON_SIZE_SM} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    tone="danger"
                    aria-label={`Delete ${template.name}`}
                    onClick={() => {
                      if (!window.confirm(`Delete "${template.name}"?`)) return;
                      deleteTeamTemplate(template.id).then(() => router.refresh());
                    }}
                  >
                    <TrashIcon size={ICON_SIZE_SM} />
                  </IconButton>
                </div>
              </li>
            ))}
            {teamTemplates.length === 0 && (
              <p className="text-sm text-muted">No team templates yet.</p>
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
