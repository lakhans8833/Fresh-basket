import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local image storage (no Supabase Storage; development / self-hosting): `next start` only serves files
 * that were in /public when it started, so photos and logos uploaded afterwards are served from here.
 * Only image files written by lib/upload.ts (names are random UUIDs; content checked at upload).
 */
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  if (!parts.length || parts.some((p) => !/^[A-Za-z0-9._-]+$/.test(p) || p.startsWith("."))) return new Response("Not found", { status: 404 });
  const ext = parts.at(-1)!.split(".").pop()!.toLowerCase();
  const type = TYPES[ext];
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(process.cwd(), "public", "uploads", ...parts));
    return new Response(new Uint8Array(body), {
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
