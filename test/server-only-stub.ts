/**
 * Test stub for the `server-only` package — see the note in `vitest.config.ts`.
 *
 * The real module's only export is a throw, which exists so a bundler fails a
 * build that pulls a server module into a client bundle. Next still enforces
 * that; this stub only lets vitest import the same files in Node, where the
 * distinction has no meaning.
 */
export {};
