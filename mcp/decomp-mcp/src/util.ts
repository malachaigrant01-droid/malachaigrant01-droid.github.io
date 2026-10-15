import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

export const MAX_FILE_BYTES = Number(process.env.DECOMP_MAX_FILE_BYTES ?? 256 * 1024 * 1024);
export const EXEC_TIMEOUT_MS = Number(process.env.DECOMP_TIMEOUT_MS ?? 60_000);

/** Directories tools may read from. Colon-separated DECOMP_ROOTS, default: cwd. */
export const ROOTS = (process.env.DECOMP_ROOTS ?? process.cwd())
  .split(path.delimiter)
  .filter(Boolean)
  .map((r) => path.resolve(r));

export class ToolError extends Error {}

/** Resolve a user path, following symlinks, and refuse anything outside ROOTS. */
export async function resolveInput(p: string): Promise<{ file: string; size: number }> {
  const abs = path.resolve(ROOTS[0], p);
  let real: string;
  try {
    real = await realpath(abs);
  } catch {
    throw new ToolError(`File not found: ${abs}. Paths are resolved against ${ROOTS[0]}.`);
  }
  const roots = await Promise.all(ROOTS.map((r) => realpath(r).catch(() => r)));
  if (!roots.some((r) => real === r || real.startsWith(r + path.sep))) {
    throw new ToolError(
      `Refusing to read ${real}: outside the allowed roots (${roots.join(", ")}). Set DECOMP_ROOTS to widen access.`,
    );
  }
  const st = await stat(real);
  if (!st.isFile()) throw new ToolError(`${real} is not a regular file.`);
  if (st.size > MAX_FILE_BYTES) {
    throw new ToolError(`${real} is ${st.size} bytes, over the ${MAX_FILE_BYTES}-byte limit (DECOMP_MAX_FILE_BYTES).`);
  }
  return { file: real, size: st.size };
}

/** Run a binary without a shell. Resolves stdout; rejects with a ToolError on failure. */
export function run(cmd: string, args: string[], timeout = EXEC_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      const e = err as NodeJS.ErrnoException & { killed?: boolean };
      if (e.code === "ENOENT") return reject(new ToolError(`'${cmd}' is not installed or not on PATH.`));
      if (e.killed) return reject(new ToolError(`'${cmd}' timed out after ${timeout} ms (DECOMP_TIMEOUT_MS).`));
      reject(new ToolError(`'${cmd} ${args.join(" ")}' failed: ${(stderr || e.message).trim().slice(0, 2000)}`));
    });
  });
}

export async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await run("sh", ["-c", 'command -v "$1"', "sh", cmd], 5000);
    return true;
  } catch {
    return false;
  }
}

export interface Page {
  text: string;
  offset: number;
  returned: number;
  total: number;
  has_more: boolean;
  next_offset?: number;
}

/** Line-based pagination so large listings never flood the context window. */
export function paginate(lines: string[], offset: number, limit: number): Page {
  const slice = lines.slice(offset, offset + limit);
  const has_more = offset + slice.length < lines.length;
  return {
    text: slice.join("\n"),
    offset,
    returned: slice.length,
    total: lines.length,
    has_more,
    ...(has_more ? { next_offset: offset + slice.length } : {}),
  };
}

export function pageFooter(p: Page): string {
  return p.has_more
    ? `\n\n[lines ${p.offset}-${p.offset + p.returned - 1} of ${p.total}; call again with offset=${p.next_offset}]`
    : `\n\n[${p.total} lines total]`;
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Shannon entropy in bits per byte (0..8). Values above ~7.2 suggest packing or encryption. */
export function entropy(buf: Buffer): number {
  if (buf.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (const b of buf) counts[b]++;
  let h = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / buf.length;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 1000) / 1000;
}

export type Format = "elf" | "pe" | "macho" | "macho-fat" | "wasm" | "javascript" | "unknown";

export function detectFormat(head: Buffer, file: string): Format {
  const m4 = head.subarray(0, 4).toString("hex");
  if (m4 === "7f454c46") return "elf";
  if (head.subarray(0, 2).toString("latin1") === "MZ") return "pe";
  if (["feedface", "feedfacf", "cefaedfe", "cffaedfe"].includes(m4)) return "macho";
  if (m4 === "cafebabe") return "macho-fat"; // also Java class files; `file` disambiguates
  if (m4 === "0061736d") return "wasm";
  if (/\.(m?js|cjs)$/i.test(file)) return "javascript";
  const text = head.toString("utf8");
  if (/^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(text) && /function|=>|var |const |let |\(\)/.test(text)) {
    return "javascript";
  }
  return "unknown";
}

/** Symbols and addresses passed into tool command lines must look like identifiers or hex. */
export function checkSymbol(sym: string): string {
  if (!/^(0x[0-9a-fA-F]+|[A-Za-z_.$@][\w.$@:<>~]*)$/.test(sym)) {
    throw new ToolError(`'${sym}' is not a valid symbol name or 0x-prefixed address.`);
  }
  return sym;
}
