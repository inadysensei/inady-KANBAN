import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { appSettings } from "../db/schema";
import {
  DEFAULT_CLAUDE_EFFORT,
  DEFAULT_CLAUDE_MODEL,
  type ClaudeEffort,
  type ClaudeModel,
  parseClaudeEffort,
  parseClaudeModel,
} from "./agent-launch";
import { DEFAULT_DATE_FORMAT, type DateFormat, parseDateFormat } from "./date-format";
import {
  type AgentToolSetting,
  parseAgentTools,
  serializeAgentTools,
} from "./agent-tools";

/** The single `app_settings` row both the Claude defaults and the boot-time
 *  seeding flag live on. */
export const SETTINGS_ROW_ID = "default";

/** The single settings row (or undefined before it's first written). */
function readSettingsRow() {
  return db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ROW_ID))
    .get();
}

/**
 * Patch the single settings row, creating it if absent. Every writer goes
 * through here so the "stamp `updatedAt` on every write" invariant lives in one
 * place and a new column writer is one line.
 */
function upsertAppSettings(
  patch: Partial<typeof appSettings.$inferInsert>,
): void {
  const updatedAt = Date.now();
  if (readSettingsRow()) {
    db.update(appSettings)
      .set({ ...patch, updatedAt })
      .where(eq(appSettings.id, SETTINGS_ROW_ID))
      .run();
  } else {
    db.insert(appSettings)
      .values({ id: SETTINGS_ROW_ID, ...patch, updatedAt })
      .run();
  }
}

export type ClaudeDefaults = {
  model: ClaudeModel;
  effort: ClaudeEffort;
};

export function readClaudeDefaults(): ClaudeDefaults {
  const row = readSettingsRow();
  if (!row) {
    return { model: DEFAULT_CLAUDE_MODEL, effort: DEFAULT_CLAUDE_EFFORT };
  }
  return {
    model: parseClaudeModel(row.claudeModel),
    effort: parseClaudeEffort(row.claudeEffort),
  };
}

export function writeClaudeDefaults(defaults: ClaudeDefaults): void {
  upsertAppSettings({
    claudeModel: defaults.model,
    claudeEffort: defaults.effort,
  });
}

/** The user-chosen date display format (Settings), default YYYY/MM/DD. */
export function readDateFormat(): DateFormat {
  const row = readSettingsRow();
  return row ? parseDateFormat(row.dateFormat) : DEFAULT_DATE_FORMAT;
}

export function writeDateFormat(format: DateFormat): void {
  upsertAppSettings({ dateFormat: format });
}

/** The configured AI tools (enabled + order), normalized — defaults to every
 *  kind enabled when unset. */
export function readAgentTools(): AgentToolSetting[] {
  return parseAgentTools(readSettingsRow()?.agentTools);
}

export function writeAgentTools(tools: AgentToolSetting[]): void {
  upsertAppSettings({ agentTools: serializeAgentTools(tools) });
}

export { DEFAULT_CLAUDE_EFFORT, DEFAULT_CLAUDE_MODEL };
