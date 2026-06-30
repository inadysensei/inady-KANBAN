"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { createTicket } from "@/actions/tickets";
import { addRepository, pickRepositoryDirectory } from "@/actions/repositories";
import type { Tag } from "@/db/schema";
import { dateInputToTimestamp } from "@/lib/date-format";
import { buttonClass, inputClass } from "@/lib/ui-classes";
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

  // Dirs added inline from this popup that may not yet be reflected in the
  // `workingDirs` prop (the server list refreshes via router.refresh() after
  // addRepository, but until it lands we union them in so the new dir is
  // immediately selectable). De-duped; extras take precedence in order.
  const [extraDirs, setExtraDirs] = useState<string[]>([]);
  const [newDir, setNewDir] = useState("");
  const [dirError, setDirError] = useState<string | null>(null);
  const [dirPending, startDirTransition] = useTransition();
  const [browsing, setBrowsing] = useState(false);

  const dirOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const dir of [...extraDirs, ...workingDirs]) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      out.push(dir);
    }
    return out;
  }, [extraDirs, workingDirs]);

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
        setWorkingDir(dirOptions[0] ?? "");
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function browseDir() {
    setDirError(null);
    setBrowsing(true);
    startDirTransition(async () => {
      try {
        const result = await pickRepositoryDirectory();
        if (!("canceled" in result)) setNewDir(result.path);
      } catch (err) {
        setDirError((err as Error).message);
      } finally {
        setBrowsing(false);
      }
    });
  }

  function addDir() {
    const trimmed = newDir.trim();
    if (!trimmed) return;
    setDirError(null);
    startDirTransition(async () => {
      try {
        await addRepository(trimmed);
        setExtraDirs((prev) =>
          prev.includes(trimmed) ? prev : [trimmed, ...prev],
        );
        setWorkingDir(trimmed);
        setNewDir("");
        // Keep the server-rendered list (and the board) in sync.
        router.refresh();
      } catch (err) {
        setDirError((err as Error).message);
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
            <div className="flex flex-col gap-1.5 text-sm text-muted">
              <span>Working directory</span>
              {dirOptions.length > 0 ? (
                <select
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  aria-label="Working directory"
                  className={inputClass("font-mono text-sm")}
                >
                  {dirOptions.map((dir) => (
                    <option key={dir} value={dir}>
                      {dir}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted">
                  No working directories yet — add one below or in{" "}
                  <Link
                    href="/settings#working-directories"
                    className="font-medium underline"
                  >
                    Settings → Working directories
                  </Link>
                  .
                </p>
              )}
              <div className="mt-1 flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
                <span className="text-xs font-semibold text-muted">
                  Add a working directory
                </span>
                <div className="flex gap-2">
                  <input
                    value={newDir}
                    onChange={(e) => setNewDir(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addDir();
                      }
                    }}
                    placeholder="/absolute/path/to/project"
                    aria-label="Working directory path"
                    className={inputClass("flex-1 font-mono text-xs")}
                  />
                  <button
                    type="button"
                    disabled={dirPending}
                    onClick={browseDir}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    {browsing ? "Choosing…" : "Browse…"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={dirPending || !newDir.trim()}
                    onClick={addDir}
                    className={buttonClass({ size: "sm" })}
                  >
                    {dirPending && !browsing ? "Adding…" : "Add"}
                  </button>
                  <Link
                    href="/settings#working-directories"
                    className="text-xs text-muted underline hover:text-fg"
                  >
                    Manage in Settings
                  </Link>
                </div>
                {dirError && (
                  <p className="text-xs text-danger" role="alert">
                    {dirError}
                  </p>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !workingDir}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
