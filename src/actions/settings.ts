"use server";

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  taskTemplates,
  teamTemplates,
  type AgentKind,
} from "@/db/schema";
import {
  CLAUDE_EFFORTS,
  CLAUDE_MODELS,
  CLINE_EFFORTS,
  type ClaudeEffort,
  type ClaudeModel,
  type ClineEffort,
  parseClineEffort,
  resolveClaudeLaunchOptions,
  serializeAgentTeamMembers,
} from "@/lib/agent-launch";
import {
  writeAgentTools,
  writeClaudeDefaults,
  writeClineDefaults,
  writeClineModelSelection,
  writeCursorModelSelection,
  writeDateFormat,
} from "@/lib/app-settings";
import {
  type AgentToolSetting,
  normalizeAgentTools,
  validateAgentTools,
} from "@/lib/agent-tools";
import {
  type CursorModelSelectionEntry,
  normalizeCursorModelSelection,
} from "@/lib/cursor-models";
import {
  type ClineModelSelectionEntry,
  normalizeClineModelSelection,
} from "@/lib/cline-models";
import { DATE_FORMATS, type DateFormat } from "@/lib/date-format";
import { assertValidWorkingDir } from "@/lib/working-dirs";

function encodeMembers(members: string[]): string {
  return serializeAgentTeamMembers(members);
}

export async function saveClaudeDefaults(input: {
  model: ClaudeModel;
  effort: ClaudeEffort;
}): Promise<void> {
  if (!CLAUDE_MODELS.includes(input.model)) {
    throw new Error("invalid claude model");
  }
  if (!CLAUDE_EFFORTS.includes(input.effort)) {
    throw new Error("invalid claude effort");
  }
  writeClaudeDefaults(input);
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveAgentTools(tools: AgentToolSetting[]): Promise<void> {
  // Re-normalize the untrusted client array (drops unknowns, de-dupes,
  // re-appends any missing kind) so the stored shape is canonical, then enforce
  // the at-least-one-enabled invariant server-side too.
  const normalized = normalizeAgentTools(tools);
  validateAgentTools(normalized);
  writeAgentTools(normalized);
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveCursorModels(
  selection: CursorModelSelectionEntry[],
): Promise<void> {
  // Re-normalize the untrusted client array (drops bad/dup entries, guarantees
  // exactly one default, falls back to the default selection when empty) so the
  // stored shape is always canonical.
  writeCursorModelSelection(normalizeCursorModelSelection(selection));
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveClineModels(
  selection: ClineModelSelectionEntry[],
): Promise<void> {
  // Same canonicalization contract as saveCursorModels (drops bad/dup entries,
  // exactly one default, default selection when empty).
  writeClineModelSelection(normalizeClineModelSelection(selection));
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveClineDefaults(input: {
  effort: ClineEffort;
}): Promise<void> {
  // Board-level default `--thinking` level (mirrors saveClaudeDefaults). The
  // cline model default lives in the cline-models selection, so this carries
  // effort only.
  if (!CLINE_EFFORTS.includes(input.effort)) {
    throw new Error("invalid cline effort");
  }
  writeClineDefaults({ effort: input.effort });
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveDateFormat(format: DateFormat): Promise<void> {
  if (!DATE_FORMATS.includes(format)) {
    throw new Error("invalid date format");
  }
  writeDateFormat(format);
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveTaskTemplate(input: {
  id?: string;
  name: string;
  title: string;
  description?: string;
  workingDir: string;
  agent: AgentKind;
  mainPrompt: string;
  useAgentTeam?: boolean;
  agentTeamMembers?: string[];
  claudeModel?: ClaudeModel | null;
  claudeEffort?: ClaudeEffort | null;
  cursorModel?: string | null;
  clineModel?: string | null;
  clineEffort?: ClineEffort | null;
}): Promise<{ id: string }> {
  const name = input.name.trim();
  const title = input.title.trim();
  const mainPrompt = input.mainPrompt.trim();
  if (!name) throw new Error("template name is required");
  if (!title) throw new Error("ticket title is required");
  if (!mainPrompt) throw new Error("prompt is required");
  const workingDir = input.workingDir.trim();
  await assertValidWorkingDir(workingDir);

  const now = Date.now();
  const members = encodeMembers(input.agentTeamMembers ?? []);
  const useAgentTeam = Boolean(input.useAgentTeam);
  const claudeLaunch =
    input.agent === "claude"
      ? resolveClaudeLaunchOptions({
          model: input.claudeModel,
          effort: input.claudeEffort,
        })
      : null;
  // Cursor: store the chosen model as-is (or null → resolves to the configured
  // default at execution time). Effort is baked into the cursor model id.
  const cursorModel =
    input.agent === "cursor" ? input.cursorModel?.trim() || null : null;
  // Cline: store the chosen model as-is (or null → resolves to the configured
  // default at execution time). Effort is a separate --thinking level.
  const clineModel =
    input.agent === "cline" ? input.clineModel?.trim() || null : null;
  const clineEffort =
    input.agent === "cline" ? parseClineEffort(input.clineEffort) : null;

  if (input.id) {
    const existing = db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, input.id))
      .get();
    if (!existing) throw new Error("template not found");
    db.update(taskTemplates)
      .set({
        name,
        title,
        description: input.description?.trim() ?? "",
        workingDir,
        agent: input.agent,
        mainPrompt,
        useAgentTeam,
        agentTeamMembers: members,
        claudeModel: claudeLaunch?.model ?? null,
        claudeEffort: claudeLaunch?.effort ?? null,
        cursorModel,
        clineModel,
        clineEffort,
        updatedAt: now,
      })
      .where(eq(taskTemplates.id, input.id))
      .run();
    revalidatePath("/settings");
    revalidatePath("/");
    return { id: input.id };
  }

  const last = db.select({ p: max(taskTemplates.position) }).from(taskTemplates).get();
  const id = crypto.randomUUID();
  db.insert(taskTemplates)
    .values({
      id,
      name,
      title,
      description: input.description?.trim() ?? "",
      workingDir,
      agent: input.agent,
      mainPrompt,
      useAgentTeam,
      agentTeamMembers: members,
      claudeModel: claudeLaunch?.model ?? null,
      claudeEffort: claudeLaunch?.effort ?? null,
      cursorModel,
      clineModel,
      clineEffort,
      position: (last?.p ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  revalidatePath("/settings");
  revalidatePath("/");
  return { id };
}

export async function deleteTaskTemplate(id: string): Promise<void> {
  db.delete(taskTemplates).where(eq(taskTemplates.id, id)).run();
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveTeamTemplate(input: {
  id?: string;
  name: string;
  members: string[];
}): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("team template name is required");
  const members = encodeMembers(input.members);
  const now = Date.now();

  if (input.id) {
    const existing = db
      .select()
      .from(teamTemplates)
      .where(eq(teamTemplates.id, input.id))
      .get();
    if (!existing) throw new Error("team template not found");
    db.update(teamTemplates)
      .set({ name, members, updatedAt: now })
      .where(eq(teamTemplates.id, input.id))
      .run();
    revalidatePath("/settings");
    revalidatePath("/");
    return { id: input.id };
  }

  const id = crypto.randomUUID();
  db.insert(teamTemplates)
    .values({ id, name, members, createdAt: now, updatedAt: now })
    .run();
  revalidatePath("/settings");
  revalidatePath("/");
  return { id };
}

export async function deleteTeamTemplate(id: string): Promise<void> {
  db.delete(teamTemplates).where(eq(teamTemplates.id, id)).run();
  revalidatePath("/settings");
  revalidatePath("/");
}
