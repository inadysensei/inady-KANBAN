"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { createTicket } from "@/actions/tickets";
import type { Tag } from "@/db/schema";
import { dateInputToTimestamp } from "@/lib/date-format";
import { inputClass } from "@/lib/ui-classes";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import TagPicker from "@/components/TagPicker";
import { AddIcon, CloseIcon, ICON_SIZE, ICON_SIZE_SM } from "@/components/ui/icons";

export default function NewTicketForm({
  workingDirs,
  tags,
}: {
  workingDirs: string[];
  tags: Tag[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [memo, setMemo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [workingDir, setWorkingDir] = useState(workingDirs[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const noDirs = workingDirs.length === 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createTicket({
          title,
          description,
          memo,
          workingDir,
          deadline: dateInputToTimestamp(deadline),
          tagIds,
        });
        setTitle("");
        setDescription("");
        setMemo("");
        setDeadline("");
        setTagIds([]);
        setWorkingDir(workingDirs[0] ?? "");
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          icon={<AddIcon size={ICON_SIZE_SM} />}
        >
          New ticket
        </Button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <form
            onSubmit={submit}
            className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border border-line bg-panel p-8 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">New ticket</h2>
              <IconButton
                size="sm"
                className="-mr-2 -mt-2"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <CloseIcon size={ICON_SIZE} />
              </IconButton>
            </div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className={inputClass("text-base")}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (Markdown, sent to the agent as background)"
              rows={8}
              className={inputClass("font-mono text-sm")}
            />
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Memo (not sent to the agent — e.g. Slack thread URL)"
              rows={3}
              className={inputClass("font-mono text-sm")}
            />
            <label className="flex flex-col gap-1 text-sm text-muted">
              Deadline (optional)
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={inputClass()}
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm text-muted">
              Tags (optional)
              <TagPicker tags={tags} selected={tagIds} onChange={setTagIds} />
            </div>
            {noDirs ? (
              <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
                No repositories configured. Add one in{" "}
                <Link href="/settings#repositories" className="font-medium underline">
                  Settings → Repositories
                </Link>
                .
              </p>
            ) : (
              <select
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                aria-label="Working directory"
                className={inputClass("font-mono text-sm")}
              >
                {workingDirs.map((dir) => (
                  <option key={dir} value={dir}>
                    {dir}
                  </option>
                ))}
              </select>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || noDirs}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
