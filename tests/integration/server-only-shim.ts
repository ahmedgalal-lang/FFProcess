// Vitest runs in a plain Node process, not Next.js's bundler, so the "server-only"
// package (a marker with no real exports, aliased by Next's bundler to guard against
// client-side imports) has nothing to resolve to. Integration tests exercise Server
// Actions directly in a server-only Node context anyway, so a no-op stand-in is correct.
export {};
