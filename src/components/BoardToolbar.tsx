"use client";

import Button from "@/components/ui/Button";
import TagBadge from "@/components/TagBadge";
import {
  CloseIcon,
  ICON_SIZE_SM,
  SearchIcon,
} from "@/components/ui/icons";
import type { TagChip } from "@/lib/tags";
import { inputClass } from "@/lib/ui-classes";

/**
 * The board's instant-filter toolbar (search / tag). Purely presentational:
 * Board owns the filter state and the debounce, so this just renders the
 * controls and reports changes up. The `query` is the *raw* (un-debounced)
 * value so typing stays snappy and "Clear all" resets it instantly.
 */
export default function BoardToolbar({
  query,
  onQueryChange,
  activeTagChips,
  onToggleTag,
  onClearAll,
  matchCount,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  /** Resolved chips for the currently-active tag filters (the clear bar). */
  activeTagChips: TagChip[];
  onToggleTag: (tagId: string) => void;
  onClearAll: () => void;
  /** Total cards visible across all columns under the current filter. */
  matchCount: number;
}) {
  const anyActive = query.trim() !== "" || activeTagChips.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon
            size={ICON_SIZE_SM}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search title or directory…"
            aria-label="Search tickets"
            className={inputClass("pl-8 pr-9")}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-faint transition-colors hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <CloseIcon size={ICON_SIZE_SM} />
            </button>
          )}
        </div>
        {anyActive && (
          <div className="flex items-center gap-2">
            {matchCount === 0 && (
              <span className="text-xs text-muted" role="status">
                No matches in view
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Clear all
            </Button>
          </div>
        )}
      </div>
      {activeTagChips.length > 0 && (
        <div
          role="group"
          aria-label="Active tag filters"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Tags
          </span>
          {activeTagChips.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              size="xs"
              active
              onClick={() => onToggleTag(tag.id)}
              title={`Remove ${tag.name} filter`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
