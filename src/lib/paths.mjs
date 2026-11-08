import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DIST = path.join(ROOT, "dist");
export const DATA = path.join(ROOT, "data");
export const CONFIG = path.join(ROOT, "config");
export const PUBLIC = path.join(ROOT, "public");
