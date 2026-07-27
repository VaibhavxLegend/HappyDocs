import * as path from "node:path";

export function normalizeRoutePath(...parts: Array<string | undefined>): string {
  const joined = parts
    .filter((part): part is string => Boolean(part))
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
  const normalized = `/${joined}`.replace(/\/+/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

export function openApiPath(route: string): string {
  return route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function relativeTo(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  return relative || path.basename(filePath);
}

export function tagFromPath(route: string): string {
  const segment = route.split("/").find((item) => item && !item.startsWith(":"));
  return segment
    ? segment.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Default";
}
