// Next 16 removed `next lint`; we run ESLint directly. eslint-config-next 16
// ships a flat-config array (ESLint 9 flat config), so we spread it here. This
// replaces the legacy `.eslintrc.json` that extended "next/core-web-vitals".
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      ".next-stale-*/**",
      ".next.stale.*/**",
      "node_modules/**",
      "drizzle/**",
      "data/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  {
    // eslint-plugin-react-hooks@7 (bundled with eslint-config-next 16) adds new
    // React-Compiler-era rules that didn't exist under the previous config.
    // This project doesn't enable the React Compiler, and these rules fire on
    // intentional, documented patterns:
    //   - purity: `Date.now()` read inside force-dynamic Server Components
    //     (runs once per request on the server — valid, see page.tsx comments)
    //   - refs: the "latest callback" ref pattern in Terminal.tsx
    //   - set-state-in-effect: syncing a server prop into optimistic local
    //     state (TicketDetailView/MemoSection/NotificationCenter)
    // Turned off to preserve the pre-upgrade lint baseline without rewriting
    // load-bearing runtime patterns during a dependency bump.
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
