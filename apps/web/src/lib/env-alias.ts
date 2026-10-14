/**
 * Finds a setting by its standard name, or by the same name with a prefix added by the
 * Vercel ↔ Supabase integration's "Custom Prefix" option. With prefix STORAGE, for example,
 * POSTGRES_URL arrives as STORAGE_POSTGRES_URL and NEXT_PUBLIC_SUPABASE_URL as
 * NEXT_PUBLIC_STORAGE_SUPABASE_URL (or STORAGE_NEXT_PUBLIC_SUPABASE_URL).
 * The exact name always wins. Pure function: safe to use from next.config and server code.
 */
export function envAlias(name: string, source: Record<string, string | undefined> = process.env): string | undefined {
  const clean = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : undefined);
  const exact = clean(source[name]);
  if (exact) return exact;

  const PUB = "NEXT_PUBLIC_";
  const isPublic = name.startsWith(PUB);
  const bare = isPublic ? name.slice(PUB.length) : name;
  const candidates = Object.keys(source)
    .filter((k) => {
      if (k === name || !clean(source[k])) return false;
      const kPublic = k.startsWith(PUB) || k.includes(`_${PUB}`);
      if (kPublic !== isPublic) return false;
      const kBare = k.replace(PUB, "");
      // a prefix followed by "_" and then exactly the standard name
      return kBare.endsWith(`_${bare}`) && /^[A-Z0-9_]+$/.test(k);
    })
    .sort();
  return candidates.length ? clean(source[candidates[0]!]) : undefined;
}
