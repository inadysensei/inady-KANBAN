import { expect, test } from "vitest";
import { wrapPrompt } from "./prompt";

test("frames the ticket (title + description) and the user's instruction", () => {
  expect(wrapPrompt("Fix login", "It breaks on mobile", "do the thing")).toBe(
    [
      "The following is a ticket from the inady KANBAN board. Read it and make sure you understand it first.",
      "",
      "# Ticket: Fix login",
      "",
      "It breaks on mobile",
      "",
      "# Request",
      "",
      "do the thing",
    ].join("\n"),
  );
});

test("omits the description block when the description is empty", () => {
  expect(wrapPrompt("Fix login", "", "do the thing")).toBe(
    [
      "The following is a ticket from the inady KANBAN board. Read it and make sure you understand it first.",
      "",
      "# Ticket: Fix login",
      "",
      "# Request",
      "",
      "do the thing",
    ].join("\n"),
  );
  expect(wrapPrompt("Fix login", "   ", "do the thing")).toBe(
    wrapPrompt("Fix login", "", "do the thing"),
  );
});

test("trims surrounding whitespace from every part", () => {
  expect(wrapPrompt("  Fix login  ", "  bg  ", "  do x  ")).toBe(
    [
      "The following is a ticket from the inady KANBAN board. Read it and make sure you understand it first.",
      "",
      "# Ticket: Fix login",
      "",
      "bg",
      "",
      "# Request",
      "",
      "do x",
    ].join("\n"),
  );
});
