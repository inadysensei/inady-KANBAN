"use client";

import Link from "next/link";
import type { Tag } from "@/db/schema";
import TagBadge from "@/components/TagBadge";

/**
 * Toggleable tag chips for the ticket create/edit forms. Selected chips render
 * in full color; unselected ones are dimmed. Tags are addressed by id (the
 * registration contract). With no tags configured, it shows a hint that links
 * to Settings.
 */
export default function TagPicker({
  tags,
  selected,
  onChange,
}: {
  tags: Pick<Tag, "id" | "name" | "color">[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (tags.length === 0) {
    return (
      <p className="text-xs text-muted">
        No tags yet — add some in{" "}
        <Link href="/settings#tags" className="font-medium underline">
          Settings → Tags
        </Link>
        .
      </p>
    );
  }

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );

  return (
    <div role="group" aria-label="Tags" className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const on = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(tag.id)}
            className={`rounded-full transition-opacity focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 ${
              on ? "" : "opacity-40 hover:opacity-70"
            }`}
          >
            <TagBadge tag={tag} />
          </button>
        );
      })}
    </div>
  );
}
