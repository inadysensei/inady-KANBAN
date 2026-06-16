"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createMemo, deleteMemo, updateMemo } from "@/actions/memos";
import type { TicketMemo } from "@/db/schema";
import { inputClass } from "@/lib/ui-classes";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Spinner from "@/components/Spinner";
import {
  AddIcon,
  EditIcon,
  ICON_SIZE_SM,
  TrashIcon,
} from "@/components/ui/icons";

/**
 * Inline memo list for a ticket — Notion/Confluence style. Add via the form
 * (saved on the spot), edit / delete each entry in place, all without leaving
 * the page. Memos arrive oldest-first from the server; local state mirrors the
 * props (same pattern as TicketDetailView's `sessionsState`) so mutations feel
 * instant, then `router.refresh()` reconciles with the server.
 */
export default function MemoSection({
  ticketId,
  memos,
}: {
  ticketId: string;
  memos: TicketMemo[];
}) {
  const router = useRouter();
  const [memosState, setMemosState] = useState(memos);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  useEffect(() => {
    setMemosState(memos);
  }, [memos]);

  const handleAdd = () => {
    if (adding) return; // guard the Cmd/Ctrl+Enter path against double-submit
    const body = draft.trim();
    if (!body) return;
    setError(null);
    startAdd(async () => {
      try {
        const memo = await createMemo(ticketId, body);
        setMemosState((prev) => [...prev, memo]);
        setDraft("");
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  const startEdit = (memo: TicketMemo) => {
    setError(null);
    setEditingId(memo.id);
    setEditDraft(memo.body);
  };

  const handleSaveEdit = async (memo: TicketMemo) => {
    const body = editDraft.trim();
    if (!body) return;
    setError(null);
    setSavingId(memo.id);
    try {
      await updateMemo(memo.id, body);
      setMemosState((prev) =>
        prev.map((m) =>
          m.id === memo.id ? { ...m, body, updatedAt: Date.now() } : m,
        ),
      );
      setEditingId(null);
      setEditDraft("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (memo: TicketMemo) => {
    const preview =
      memo.body.replace(/\s+/g, " ").trim().slice(0, 60) +
      (memo.body.trim().length > 60 ? "…" : "");
    if (!window.confirm(`Delete "${preview}"?`)) return;

    setError(null);
    setDeletingId(memo.id);
    try {
      await deleteMemo(memo.id);
      setMemosState((prev) => prev.filter((m) => m.id !== memo.id));
      setEditingId((cur) => (cur === memo.id ? null : cur));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter submits, like Notion/Slack.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Memo</h3>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {memosState.length > 0 && (
        <ul className="flex flex-col gap-2">
          {memosState.map((memo, i) => (
            <li
              key={memo.id}
              className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5"
            >
              {editingId === memo.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    aria-label={`Edit memo ${i + 1}`}
                    rows={3}
                    autoFocus
                    className={inputClass("font-mono text-xs")}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={savingId === memo.id || !editDraft.trim()}
                      aria-busy={savingId === memo.id}
                      onClick={() => handleSaveEdit(memo)}
                    >
                      {savingId === memo.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-0">
                  <div className="markdown min-w-0 break-all text-xs leading-normal text-fg [&_p]:my-0 [&_p+p]:mt-1 [&_ul]:my-0 [&_ol]:my-0 [&_ul]:mt-1 [&_ol]:mt-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {memo.body}
                    </ReactMarkdown>
                  </div>
                  <div className="flex justify-end gap-1">
                    <IconButton
                      size="sm"
                      aria-label={`Edit memo ${i + 1}`}
                      onClick={() => startEdit(memo)}
                    >
                      <EditIcon size={ICON_SIZE_SM} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      tone="danger"
                      aria-label={`Delete memo ${i + 1}`}
                      disabled={deletingId === memo.id}
                      aria-busy={deletingId === memo.id}
                      onClick={() => handleDelete(memo)}
                    >
                      {deletingId === memo.id ? (
                        <Spinner />
                      ) : (
                        <TrashIcon size={ICON_SIZE_SM} />
                      )}
                    </IconButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onDraftKeyDown}
          placeholder="Add a memo (Markdown — not sent to the agent). ⌘/Ctrl+Enter to save."
          aria-label="New memo"
          rows={2}
          className={inputClass("font-mono text-xs")}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={adding || !draft.trim()}
            aria-busy={adding}
            onClick={handleAdd}
            icon={<AddIcon size={ICON_SIZE_SM} />}
          >
            {adding ? "Adding…" : "Add memo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
