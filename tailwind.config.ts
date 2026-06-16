import type { Config } from "tailwindcss";

/**
 * Semantic colors backed by the CSS vars defined in globals.css. Components use
 * these (`bg-canvas`, `text-fg`, `border-line`, `bg-accent`, status colors)
 * instead of raw `neutral-*`/`white`, so the whole theme lives in one place.
 * The `rgb(var(--x) / <alpha-value>)` form lets opacity modifiers work
 * (`bg-ok/15`, `ring-accent/60`, `border-danger/40`).
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        card: token("card"),
        panel: token("panel"),
        line: token("line"),
        "line-strong": token("line-strong"),
        fg: token("fg"),
        muted: token("muted"),
        faint: token("faint"),
        accent: token("accent"),
        "accent-fg": token("accent-fg"),
        ok: token("ok"),
        warn: token("warn"),
        danger: token("danger"),
        idle: token("idle"),
      },
    },
  },
  plugins: [],
};

export default config;
