// TypeScript 6 (TS2882) requires type declarations for side-effect imports.
// Next bundles CSS via its own loaders, but `tsc --noEmit` needs to know that
// `import "./globals.css"` / `import "@xterm/xterm/css/xterm.css"` are valid.
declare module "*.css";
