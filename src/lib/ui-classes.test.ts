import { describe, expect, it } from "vitest";
import {
  badgeClass,
  buttonClass,
  cardClass,
  cx,
  iconButtonClass,
  inputClass,
} from "./ui-classes";

describe("cx", () => {
  it("joins truthy parts and drops falsy ones", () => {
    expect(cx("a", false, "b", undefined, null, "c")).toBe("a b c");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cx(false, undefined, null)).toBe("");
  });
});

describe("buttonClass", () => {
  it("defaults to the primary md variant (accent-filled)", () => {
    const cls = buttonClass();
    expect(cls).toContain("bg-accent");
    expect(cls).toContain("text-accent-fg");
    // shared affordances
    expect(cls).toContain("rounded-md");
    expect(cls).toContain("focus-visible:ring-accent/60");
    expect(cls).toContain("disabled:opacity-50");
  });

  it("renders a bordered, neutral secondary button", () => {
    const cls = buttonClass({ variant: "secondary" });
    expect(cls).toContain("border-line-strong");
    expect(cls).toContain("text-fg");
    expect(cls).not.toContain("bg-accent");
  });

  it("renders a transparent ghost button", () => {
    const cls = buttonClass({ variant: "ghost" });
    expect(cls).toContain("text-muted");
    expect(cls).not.toContain("border-line-strong");
  });

  it("renders a danger-tinted destructive button", () => {
    const cls = buttonClass({ variant: "destructive" });
    expect(cls).toContain("text-danger");
    expect(cls).toContain("border-danger/40");
  });

  it("renders a success-tinted (green) button", () => {
    const cls = buttonClass({ variant: "success" });
    expect(cls).toContain("text-ok");
    expect(cls).toContain("border-ok/40");
  });

  it("renders an accent-tinted (violet) outline button distinct from primary", () => {
    const cls = buttonClass({ variant: "accent" });
    expect(cls).toContain("text-accent");
    expect(cls).toContain("border-accent/40");
    expect(cls).not.toContain("bg-accent text-accent-fg");
  });

  it("applies the sm size scale", () => {
    expect(buttonClass({ size: "sm" })).toContain("text-xs");
    expect(buttonClass({ size: "md" })).toContain("text-sm");
  });

  it("appends an extra className last", () => {
    expect(buttonClass({ extra: "w-full" }).endsWith("w-full")).toBe(true);
  });
});

describe("iconButtonClass", () => {
  it("is a square control with the default tone", () => {
    const cls = iconButtonClass();
    expect(cls).toMatch(/h-8|h-7/);
    expect(cls).toContain("text-muted");
    expect(cls).toContain("focus-visible:ring-accent/60");
  });

  it("uses danger hover affordances for the danger tone", () => {
    const cls = iconButtonClass({ tone: "danger" });
    expect(cls).toContain("hover:text-danger");
  });

  it("supports the sm size", () => {
    expect(iconButtonClass({ size: "sm" })).toContain("h-7");
  });
});

describe("inputClass", () => {
  it("is a full-width token-themed field with a focus ring", () => {
    const cls = inputClass();
    expect(cls).toContain("w-full");
    expect(cls).toContain("bg-surface");
    expect(cls).toContain("border-line-strong");
    expect(cls).toContain("focus-visible:ring-accent/60");
    expect(cls).toContain("placeholder:text-faint");
  });

  it("appends extra classes (e.g. font-mono)", () => {
    expect(inputClass("font-mono text-xs")).toContain("font-mono text-xs");
  });
});

describe("cardClass", () => {
  it("is a bordered card surface", () => {
    const cls = cardClass();
    expect(cls).toContain("bg-card");
    expect(cls).toContain("border-line");
    expect(cls).toContain("rounded-lg");
  });

  it("appends extra classes (e.g. padding)", () => {
    expect(cardClass("p-3")).toContain("p-3");
  });
});

describe("badgeClass", () => {
  it("defaults to the neutral tone", () => {
    const cls = badgeClass();
    expect(cls).toContain("rounded-full");
    expect(cls).toContain("bg-panel");
    expect(cls).toContain("text-muted");
  });

  it.each([
    ["ok", "bg-ok/15", "text-ok"],
    ["warn", "bg-warn/15", "text-warn"],
    ["danger", "bg-danger/15", "text-danger"],
    ["accent", "bg-accent/15", "text-accent"],
  ] as const)("maps the %s tone to its token colors", (tone, bg, fg) => {
    const cls = badgeClass(tone);
    expect(cls).toContain(bg);
    expect(cls).toContain(fg);
  });
});
