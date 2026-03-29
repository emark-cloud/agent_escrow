import { join } from "path";

/**
 * Resolve a data file path. On Vercel (read-only filesystem), writes go to /tmp.
 * Locally, files stay in the project root (process.cwd()) as before.
 */
export function dataPath(filename: string): string {
  const dir = process.env.VERCEL ? "/tmp" : process.cwd();
  return join(dir, filename);
}
