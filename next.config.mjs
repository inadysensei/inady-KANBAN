/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 / node-pty are native (.node) modules. Keep them external so
  // the server bundle requires them at runtime instead of trying to bundle them.
  serverExternalPackages: ["better-sqlite3", "node-pty"],
  // The terminal effect spawns a real PTY process on mount and kills it on
  // cleanup. React Strict Mode's dev-only double-invoke would double-spawn, so
  // disable it to keep dev behavior matching production.
  reactStrictMode: false,
  // ESLint is run via `npm run lint`, not as a build gate, so a lint nit never
  // blocks `next build`. Type errors still fail the build (we want that).
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
