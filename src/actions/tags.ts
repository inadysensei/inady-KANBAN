"use server";

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { tags } from "@/db/schema";
import { normalizeTagColor, normalizeTagName } from "@/lib/tags";

function revalidate(): void {
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveTag(input: {
  id?: string;
  name: string;
  color: string;
}): Promise<{ id: string }> {
  const name = normalizeTagName(input.name);
  const color = normalizeTagColor(input.color);
  const now = Date.now();

  // Names are unique (the board shows them as labels) — reject a clash up front
  // for a friendly message rather than a raw SQLite constraint error.
  const clash = db.select().from(tags).where(eq(tags.name, name)).get();
  if (clash && clash.id !== input.id) {
    throw new Error("a tag with that name already exists");
  }

  if (input.id) {
    const existing = db.select().from(tags).where(eq(tags.id, input.id)).get();
    if (!existing) throw new Error("tag not found");
    db.update(tags)
      .set({ name, color, updatedAt: now })
      .where(eq(tags.id, input.id))
      .run();
    revalidate();
    return { id: input.id };
  }

  const last = db.select({ p: max(tags.position) }).from(tags).get();
  const id = crypto.randomUUID();
  db.insert(tags)
    .values({
      id,
      name,
      color,
      position: (last?.p ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  revalidate();
  return { id };
}

export async function deleteTag(id: string): Promise<void> {
  // ticket_tags rows cascade-delete (FK ON DELETE CASCADE), so a removed tag
  // detaches from every ticket automatically.
  db.delete(tags).where(eq(tags.id, id)).run();
  revalidate();
}
