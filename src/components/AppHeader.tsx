"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import IconButton from "@/components/ui/IconButton";
import { ICON_SIZE, MenuIcon } from "@/components/ui/icons";

export default function AppHeader({
  title,
  showTitle = true,
  children,
}: {
  title: string;
  showTitle?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      {showTitle ? (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-fg">
            K
          </span>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>
      ) : (
        <div className="text-sm text-muted">{title}</div>
      )}
      <div className="flex items-center gap-2.5">
        {children}
        <div className="relative">
          <IconButton
            aria-label="Open menu"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((v) => !v)}
          >
            <MenuIcon size={ICON_SIZE} />
          </IconButton>
          {open && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
              />
              <nav
                aria-label="Main"
                className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-line bg-panel py-1 shadow-lg"
              >
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg focus-visible:bg-surface focus-visible:text-fg focus-visible:outline-hidden"
                >
                  Settings
                </Link>
              </nav>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
