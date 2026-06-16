import { db } from "../src/db/client";
import { tickets } from "../src/db/schema";

const now = Date.now();

db.insert(tickets)
  .values({
    id: crypto.randomUUID(),
    title: "Sample ticket",
    description:
      "## Background\n\nThis is a **seeded** ticket. Edit `working_dir` to point at a real repo, drag it to *Doing*, open it, and start an agent.",
    status: "todo",
    workingDir: process.cwd(),
    position: 1,
    createdAt: now,
    updatedAt: now,
  })
  .run();

console.log("seeded 1 ticket (working_dir =", process.cwd(), ")");
