// see: docs/phase3/07_transfer_engine.md §エンジン実装

import { canonicalizeFieldPath } from "./field-dict";

export type Mapping = {
  placeholder: string;
  fieldPath: string;
  label?: string;
  isRequired?: boolean;
};

function splitFieldPath(path: string): string[] {
  return path.split(/\.|\[(\d+)\]/).filter(Boolean);
}

export function resolveRawPath(ctx: unknown, path: string): unknown {
  let canonicalPath = canonicalizeFieldPath(path);

  if (canonicalPath === "." || canonicalPath === "this") return ctx;
  if (canonicalPath.startsWith("this.")) canonicalPath = canonicalPath.slice(5);
  if (canonicalPath.startsWith(".")) canonicalPath = canonicalPath.slice(1);
  if (!canonicalPath) return undefined;

  const parts = splitFieldPath(canonicalPath);
  let current: unknown = ctx;

  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = /^\d+$/.test(p)
      ? (current as unknown[])[Number(p)]
      : (current as Record<string, unknown>)[p];
  }

  return current;
}

export function resolvePath(ctx: unknown, path: string): string {
  const value = resolveRawPath(ctx, path);
  return value == null ? "" : String(value);
}
