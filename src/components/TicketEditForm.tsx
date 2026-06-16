"use client";

import { useState, useTransition } from "react";
import { updateTicket } from "@/actions/tickets";
import type { Tag, Ticket } from "@/db/schema";
import {
  dateInputToTimestamp,
  timestampToDateInput,
} from "@/lib/date-format";
import { cardClass, inputClass } from "@/lib/ui-classes";
import Button from "@/components/ui/Button";
import TagPicker from "@/components/TagPicker";

/**
 * Inline edit form for a ticket's title / description / working dir / deadline /
 * tags. Memos have their own inline CRUD section (MemoSection), so they're not
 * edited here. Mounted fresh each time editing starts, so the fields initialize
 * from the current ticket props.
 */
export default function TicketEditForm({
  ticket,
  workingDirs,
  allTags,
  tagIds,
  onCancel,
  onSaved,
}: {
  ticket: Ticket;
  workingDirs: string[];
  allTags: Tag[];
  tagIds: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [workingDir, setWorkingDir] = useState(ticket.workingDir);
  const [deadline, setDeadline] = useState(
    ticket.deadline != null ? timestampToDateInput(ticket.deadline) : "",
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(tagIds);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  // Keep the current dir selectable even if it's no longer in the configured list.
  const dirOptions = workingDirs.includes(ticket.workingDir)
    ? workingDirs
    : [ticket.workingDir, ...workingDirs];

  const handleSave = () => {
    setError(null);
    startSave(async () => {
      try {
        await updateTicket(ticket.id, {
          title,
          description,
          workingDir,
          deadline: dateInputToTimestamp(deadline),
          tagIds: selectedTagIds,
        });
        onSaved();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <div className={cardClass("flex flex-col gap-2 p-3")}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Title"
        className={inputClass()}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (Markdown)"
        aria-label="Description"
        rows={8}
        className={inputClass("font-mono text-xs")}
      />
      <select
        value={workingDir}
        onChange={(e) => setWorkingDir(e.target.value)}
        aria-label="Working directory"
        className={inputClass("font-mono text-xs")}
      >
        {dirOptions.map((dir) => (
          <option key={dir} value={dir}>
            {dir}
          </option>
        ))}
      </select>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Deadline
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          aria-label="Deadline"
          className={inputClass()}
        />
      </label>
      <div className="flex flex-col gap-1.5 text-xs text-muted">
        Tags
        <TagPicker
          tags={allTags}
          selected={selectedTagIds}
          onChange={setSelectedTagIds}
        />
      </div>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving || !title.trim()}
          aria-busy={saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
