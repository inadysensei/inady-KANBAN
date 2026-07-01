"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Debounce for text-heavy settings editors (templates, tags, etc.). */
export const AUTO_SAVE_DELAY_MS = 400;

export type AutoSaveOptions<T> = {
  /** When true, skip persisting (e.g. invalid/incomplete values). */
  skip?: (value: T) => boolean;
  /** Debounce delay in ms. Defaults to 0 (save immediately after change). */
  delayMs?: number;
  /** Called after a successful save. The hook always router.refresh()es. */
  onSaved?: (value: T) => void | Promise<void>;
  /** Set false to pause auto-save (e.g. while a modal picker is open). */
  enabled?: boolean;
};

/**
 * Persist `value` whenever it changes (after the initial mount). Skips the
 * first render so server-provided defaults are not written back immediately.
 */
export function useAutoSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  options: AutoSaveOptions<T> = {},
): { error: string | null; pending: boolean } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isFirst = useRef(true);
  const generationRef = useRef(0);
  const saveRef = useRef(save);
  const onSavedRef = useRef(options.onSaved);
  const skipRef = useRef(options.skip);
  saveRef.current = save;
  onSavedRef.current = options.onSaved;
  skipRef.current = options.skip;

  const enabled = options.enabled ?? true;
  const delayMs = options.delayMs ?? 0;

  useEffect(() => {
    if (!enabled) return;

    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    if (skipRef.current?.(value)) return;

    const run = () => {
      const generation = ++generationRef.current;
      setError(null);
      startTransition(async () => {
        try {
          await saveRef.current(value);
          if (generation !== generationRef.current) return;
          await onSavedRef.current?.(value);
          router.refresh();
        } catch (err) {
          if (generation !== generationRef.current) return;
          setError((err as Error).message);
        }
      });
    };

    if (delayMs > 0) {
      let debouncePending = true;
      const timer = setTimeout(() => {
        debouncePending = false;
        run();
      }, delayMs);
      return () => {
        clearTimeout(timer);
        if (debouncePending) run();
      };
    }
    run();
  }, [value, enabled, delayMs, router]);

  return { error, pending };
}
