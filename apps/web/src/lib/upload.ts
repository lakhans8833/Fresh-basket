import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { badRequest, HttpError } from "./http";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

/** Store an admin-uploaded product photo. Supabase Storage when configured, local /public/uploads in development. */
export async function storeImage(file: File): Promise<string> {
  if (file.size === 0) throw badRequest("The file is empty.");
  if (file.size > MAX_BYTES) throw badRequest("Images must be 5 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) throw badRequest("Upload a JPEG, PNG or WebP image.");
  const name = `products/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${TYPES[type]}`;

  if (env.storage.mode === "supabase") {
    const sb = createClient(env.auth.supabaseUrl!, env.storage.serviceRoleKey!, { auth: { persistSession: false } });
    const { error } = await sb.storage.from(env.storage.bucket).upload(name, buf, { contentType: type, upsert: false });
    if (error) throw new HttpError(502, `Upload failed: ${error.message}`);
    return sb.storage.from(env.storage.bucket).getPublicUrl(name).data.publicUrl;
  }
  if (env.storage.mode === "local") {
    const full = path.join(process.cwd(), "public", "uploads", name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
    return `/uploads/${name}`;
  }
  throw new HttpError(503, "Image storage is not configured (set SUPABASE_SERVICE_ROLE_KEY).");
}
