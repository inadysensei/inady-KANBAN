/**
 * Cline model support — the selection layer mirrors `cursor-models.ts`.
 *
 * Like cursor, cline takes a single combined model id via `-m <id>` (e.g.
 * "cline-pass/glm-5.2"); unlike cursor it pairs that with a separate
 * `--thinking` effort (see CLINE_EFFORTS in agent-launch.ts). cline exposes the
 * clinepass catalog only over its authenticated API (there is NO
 * `cline --list-models` to generate from), so the CATALOG here is a committed
 * constant transcribed from https://docs.cline.bot/getting-started/clinepass —
 * keep it in sync by hand when clinepass changes.
 *
 *  - CATALOG: the full set of clinepass {id,label} pairs (this file).
 *  - SELECTION: which catalog ids to show in the launch form, in what order, and
 *    which is the default pick — persisted as JSON on `app_settings.cline_models`
 *    (same JSON-in-text precedent as agent team members / agent tools / cursor
 *    models).
 *
 * Pure data + normalization logic only: no React, no node, no drizzle, so it
 * loads in the node test env and the client bundle.
 *
 * NOTE: the selection helpers below are a deliberate near-copy of
 * cursor-models.ts (rule of three not yet met). If a THIRD model-selection
 * module ever appears, extract a generic `createModelSelection(catalog,
 * fallback)` factory instead of copying this a third time.
 */

export interface ClineModelCatalogEntry {
  id: string;
  label: string;
}

/**
 * The full clinepass model set. Hand-maintained from the clinepass docs (there
 * is no CLI to generate it). All ids carry the `cline-pass/` prefix that cline
 * expects on the `-m` flag.
 */
export const CLINE_MODEL_CATALOG: ClineModelCatalogEntry[] = [
  { id: "cline-pass/glm-5.2", label: "GLM-5.2" },
  { id: "cline-pass/kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "cline-pass/kimi-k2.6", label: "Kimi K2.6" },
  { id: "cline-pass/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "cline-pass/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "cline-pass/mimo-v2.5", label: "MiMo-V2.5" },
  { id: "cline-pass/mimo-v2.5-pro", label: "MiMo-V2.5-Pro" },
  { id: "cline-pass/minimax-m3", label: "MiniMax M3" },
  { id: "cline-pass/qwen3.7-max", label: "Qwen3.7 Max" },
  { id: "cline-pass/qwen3.7-plus", label: "Qwen3.7 Plus" },
];

/** One entry in the user's curated selection. */
export interface ClineModelSelectionEntry {
  id: string;
  default: boolean;
}

/** A model offered in a dropdown — selection joined with its catalog label. */
export interface ClineModelOption {
  id: string;
  label: string;
}

/** What the launch form needs to render the cline model dropdown: the enabled
 *  options (in order) and the default pick. Mirrors `CursorModelChoices`. */
export interface ClineModelChoices {
  options: ClineModelOption[];
  default: string;
}

/** Last-resort default id when the catalog/selection can't supply one. */
export const FALLBACK_CLINE_MODEL = "cline-pass/glm-5.2";

/** Default selection when nothing is configured: GLM-5.2 (the default). Sourced
 *  from FALLBACK_CLINE_MODEL so the default id has a single home. */
export const DEFAULT_CLINE_MODELS: ClineModelSelectionEntry[] = [
  { id: FALLBACK_CLINE_MODEL, default: true },
];

// ---- selection normalization / persistence (mirrors cursor-models.ts) ----

/**
 * Canonicalize a raw array of stored/submitted entries into a valid selection:
 * - keeps stored order and the `default` flag,
 * - drops non-object entries, missing/non-string ids, and dup ids (first wins),
 * - guarantees exactly one default (first flagged, else the first entry).
 * Empty input falls back to {@link DEFAULT_CLINE_MODELS}.
 */
export function normalizeClineModelSelection(
  stored: unknown[],
): ClineModelSelectionEntry[] {
  const result: ClineModelSelectionEntry[] = [];
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
    return DEFAULT_CLINE_MODELS.map((e) => ({ ...e }));
  }
  const flagged = result.findIndex((e) => e.default);
  const def = flagged === -1 ? 0 : flagged;
  return result.map((e, i) => ({ id: e.id, default: i === def }));
}

/** Parse the stored JSON selection into a normalized list. */
export function parseClineModelSelection(
  raw: string | null | undefined,
): ClineModelSelectionEntry[] {
  return normalizeClineModelSelection(decode(raw));
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

export function serializeClineModelSelection(
  list: ClineModelSelectionEntry[],
): string {
  return JSON.stringify(list.map(({ id, default: def }) => ({ id, default: def })));
}

// ---- pure selection transforms (mirror cursor-models.ts) ----

/** Append a catalog id (no-op if already selected); the first one is default. */
export function addClineModel(
  list: ClineModelSelectionEntry[],
  id: string,
): ClineModelSelectionEntry[] {
  if (list.some((e) => e.id === id)) return list;
  return [...list, { id, default: list.length === 0 }];
}

/** Drop an id; if it was the default, re-promote the first remaining entry. */
export function removeClineModel(
  list: ClineModelSelectionEntry[],
  id: string,
): ClineModelSelectionEntry[] {
  if (!list.some((e) => e.id === id)) return list;
  const next = list.filter((e) => e.id !== id);
  if (next.length > 0 && !next.some((e) => e.default)) {
    next[0] = { ...next[0], default: true };
  }
  return next;
}

/** Move the entry at `index` one slot (-1 up / +1 down); past-the-end is a no-op. */
export function moveClineModel(
  list: ClineModelSelectionEntry[],
  index: number,
  direction: -1 | 1,
): ClineModelSelectionEntry[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Make `id` the sole default (no-op if `id` isn't in the list). */
export function setDefaultClineModel(
  list: ClineModelSelectionEntry[],
  id: string,
): ClineModelSelectionEntry[] {
  if (!list.some((e) => e.id === id)) return list;
  return list.map((e) => ({ id: e.id, default: e.id === id }));
}

/**
 * Whether `id` is a currently-available model (present in the catalog). Used
 * only to flag a configured-but-since-removed model in the UI so the user can
 * clean it up — there's no auto-substitution.
 */
export function isKnownClineModel(
  id: string,
  catalogEntries: ClineModelCatalogEntry[] = CLINE_MODEL_CATALOG,
): boolean {
  return catalogEntries.some((m) => m.id === id);
}

/** The default model id: the flagged one, else the first, else the fallback. */
export function defaultClineModel(list: ClineModelSelectionEntry[]): string {
  return (
    list.find((e) => e.default)?.id ?? list[0]?.id ?? FALLBACK_CLINE_MODEL
  );
}

// ---- display joins ----

/** A model's display label, falling back to the raw id when unknown. */
export function clineModelLabel(
  id: string,
  catalogEntries: ClineModelCatalogEntry[] = CLINE_MODEL_CATALOG,
): string {
  return catalogEntries.find((m) => m.id === id)?.label ?? id;
}

/** The selection as launch-form options (id + resolved label), in order. */
export function clineModelOptions(
  list: ClineModelSelectionEntry[],
  catalogEntries: ClineModelCatalogEntry[] = CLINE_MODEL_CATALOG,
): ClineModelOption[] {
  return list.map((e) => ({ id: e.id, label: clineModelLabel(e.id, catalogEntries) }));
}

/** Catalog entries not yet selected — what the Settings "add" dropdown offers. */
export function availableClineModelsToAdd(
  list: ClineModelSelectionEntry[],
  catalogEntries: ClineModelCatalogEntry[] = CLINE_MODEL_CATALOG,
): ClineModelOption[] {
  const chosen = new Set(list.map((e) => e.id));
  return catalogEntries
    .filter((m) => !chosen.has(m.id))
    .map((m) => ({ id: m.id, label: m.label }));
}

// ---- launch resolution ----

/** Resolve the model to launch: the chosen one, else the default, else fallback. */
export function resolveClineModel(opts: {
  model?: string | null;
  defaultModel?: string | null;
}): string {
  const model = opts.model?.trim();
  if (model) return model;
  return opts.defaultModel?.trim() || FALLBACK_CLINE_MODEL;
}
