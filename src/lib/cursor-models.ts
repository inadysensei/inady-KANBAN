import catalog from "./cursor-models.generated.json";

/**
 * Cursor model support, mirroring the `agent-tools.ts` precedent.
 *
 * Cursor has no separate "effort" flag — `cursor agent --model <id>` takes a
 * single combined id where the variant/effort is baked in (`composer-2.5`,
 * `auto`, `gpt-5.3-codex-high`, `claude-opus-4-8-thinking-high`, …). So there
 * are two layers:
 *
 *  - CATALOG: the full set of available ids+labels, generated from
 *    `cursor-agent --list-models` (scripts/sync-cursor-models.ts), committed as
 *    cursor-models.generated.json and refreshed by a daily GitHub Action.
 *  - SELECTION: which catalog ids to show in the launch form, in what order, and
 *    which is the default pick — persisted as JSON on `app_settings.cursor_models`
 *    (same JSON-in-text precedent as agent team members / agent tools).
 *
 * Pure data + normalization logic only: no React, no node, no drizzle (the JSON
 * import is plain data), so it loads in the node test env and the client bundle.
 */

export interface CursorModelCatalogEntry {
  id: string;
  label: string;
}

/** The full set of cursor models — generated, do not hand-edit. */
export const CURSOR_MODEL_CATALOG: CursorModelCatalogEntry[] =
  catalog as CursorModelCatalogEntry[];

/** One entry in the user's curated selection. */
export interface CursorModelSelectionEntry {
  id: string;
  default: boolean;
}

/** A model offered in a dropdown — selection joined with its catalog label. */
export interface CursorModelOption {
  id: string;
  label: string;
}

/** What the launch form needs to render the cursor model dropdown: the enabled
 *  options (in order) and the default pick. Mirrors `claudeDefaults`. */
export interface CursorModelChoices {
  options: CursorModelOption[];
  default: string;
}

/** Last-resort default id when the catalog/selection can't supply one. */
export const FALLBACK_CURSOR_MODEL = "composer-2.5";

/** Default selection when nothing is configured: Composer 2.5 (default) + Auto. */
export const DEFAULT_CURSOR_MODELS: CursorModelSelectionEntry[] = [
  { id: "composer-2.5", default: true },
  { id: "auto", default: false },
];

// ---- catalog parsing (used by scripts/sync-cursor-models.ts) ----

/**
 * Parse `cursor-agent --list-models` stdout into catalog entries. Reads stdout
 * only; each model line is `<id> - <label>`. Skips the "Available models"
 * header, blank lines, the trailing "Tip:" hint, and any line that isn't an
 * `id - label` pair (so interleaved stderr noise never leaks in). The transient
 * ` (current)` / ` (default)` account markers are stripped so the generated
 * catalog doesn't churn when cursor's default moves; other parentheticals
 * (e.g. "(NO ZDR)") are kept verbatim. De-duplicates by id (first wins).
 */
export function parseCursorModelList(stdout: string): CursorModelCatalogEntry[] {
  const out: CursorModelCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(\S+)\s+-\s+(.+)$/);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const label = m[2].replace(/\s*\((?:current|default)\)\s*$/i, "").trim();
    out.push({ id, label });
  }
  return out;
}

// ---- selection normalization / persistence ----

/**
 * Canonicalize a raw array of stored/submitted entries into a valid selection:
 * - keeps stored order and the `default` flag,
 * - drops non-object entries, missing/non-string ids, and dup ids (first wins),
 * - guarantees exactly one default (first flagged, else the first entry).
 * Empty input falls back to {@link DEFAULT_CURSOR_MODELS}.
 */
export function normalizeCursorModelSelection(
  stored: unknown[],
): CursorModelSelectionEntry[] {
  const result: CursorModelSelectionEntry[] = [];
  const seen = new Set<string>();
  for (const entry of stored) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || !id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      default: (entry as { default?: unknown }).default === true,
    });
  }
  if (result.length === 0) {
    return DEFAULT_CURSOR_MODELS.map((e) => ({ ...e }));
  }
  const flagged = result.findIndex((e) => e.default);
  const def = flagged === -1 ? 0 : flagged;
  return result.map((e, i) => ({ id: e.id, default: i === def }));
}

/** Parse the stored JSON selection into a normalized list. */
export function parseCursorModelSelection(
  raw: string | null | undefined,
): CursorModelSelectionEntry[] {
  return normalizeCursorModelSelection(decode(raw));
}

function decode(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeCursorModelSelection(
  list: CursorModelSelectionEntry[],
): string {
  return JSON.stringify(list.map(({ id, default: def }) => ({ id, default: def })));
}

// ---- pure selection transforms (mirror agent-tools.ts) ----

/** Append a catalog id (no-op if already selected); the first one is default. */
export function addCursorModel(
  list: CursorModelSelectionEntry[],
  id: string,
): CursorModelSelectionEntry[] {
  if (list.some((e) => e.id === id)) return list;
  return [...list, { id, default: list.length === 0 }];
}

/** Drop an id; if it was the default, re-promote the first remaining entry. */
export function removeCursorModel(
  list: CursorModelSelectionEntry[],
  id: string,
): CursorModelSelectionEntry[] {
  if (!list.some((e) => e.id === id)) return list;
  const next = list.filter((e) => e.id !== id);
  if (next.length > 0 && !next.some((e) => e.default)) {
    next[0] = { ...next[0], default: true };
  }
  return next;
}

/** Move the entry at `index` one slot (-1 up / +1 down); past-the-end is a no-op. */
export function moveCursorModel(
  list: CursorModelSelectionEntry[],
  index: number,
  direction: -1 | 1,
): CursorModelSelectionEntry[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Make `id` the sole default (no-op if `id` isn't in the list). */
export function setDefaultCursorModel(
  list: CursorModelSelectionEntry[],
  id: string,
): CursorModelSelectionEntry[] {
  if (!list.some((e) => e.id === id)) return list;
  return list.map((e) => ({ id: e.id, default: e.id === id }));
}

/**
 * Whether `id` is a currently-available model (present in the catalog). Used
 * only to flag a configured-but-since-removed model in the UI so the user can
 * clean it up — there's no auto-substitution (the daily catalog sync + manual
 * Settings edits handle model churn).
 */
export function isKnownCursorModel(
  id: string,
  catalogEntries: CursorModelCatalogEntry[] = CURSOR_MODEL_CATALOG,
): boolean {
  return catalogEntries.some((m) => m.id === id);
}

/** The default model id: the flagged one, else the first, else the fallback. */
export function defaultCursorModel(list: CursorModelSelectionEntry[]): string {
  return (
    list.find((e) => e.default)?.id ?? list[0]?.id ?? FALLBACK_CURSOR_MODEL
  );
}

// ---- display joins ----

/** A model's display label, falling back to the raw id when unknown. */
export function cursorModelLabel(
  id: string,
  catalogEntries: CursorModelCatalogEntry[] = CURSOR_MODEL_CATALOG,
): string {
  return catalogEntries.find((m) => m.id === id)?.label ?? id;
}

/** The selection as launch-form options (id + resolved label), in order. */
export function cursorModelOptions(
  list: CursorModelSelectionEntry[],
  catalogEntries: CursorModelCatalogEntry[] = CURSOR_MODEL_CATALOG,
): CursorModelOption[] {
  return list.map((e) => ({ id: e.id, label: cursorModelLabel(e.id, catalogEntries) }));
}

/** Catalog entries not yet selected — what the Settings "add" dropdown offers. */
export function availableCursorModelsToAdd(
  list: CursorModelSelectionEntry[],
  catalogEntries: CursorModelCatalogEntry[] = CURSOR_MODEL_CATALOG,
): CursorModelOption[] {
  const chosen = new Set(list.map((e) => e.id));
  return catalogEntries
    .filter((m) => !chosen.has(m.id))
    .map((m) => ({ id: m.id, label: m.label }));
}

// ---- launch resolution ----

/** Resolve the model to launch: the chosen one, else the default, else fallback. */
export function resolveCursorModel(opts: {
  model?: string | null;
  defaultModel?: string | null;
}): string {
  const model = opts.model?.trim();
  if (model) return model;
  return opts.defaultModel?.trim() || FALLBACK_CURSOR_MODEL;
}
