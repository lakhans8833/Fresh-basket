/** Admin → Users → Edit: name, mobile and sign-in email (local auth mode; Supabase uses the Auth admin API). */
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { queryOne } from "@/lib/db";
import { adminUpdateUser } from "@/lib/admin/users";

const newUser = async (email: string) =>
  (await queryOne<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))!.id;

describe("adminUpdateUser", () => {
  it("changes name, mobile and the sign-in email (auth + profile)", async () => {
    const id = await newUser(`old-${randomUUID()}@test.local`);
    const next = `New.${randomUUID()}@Test.Local`;
    const r = await adminUpdateUser(id, { fullName: "  Deepak B ", phone: "9876543210", email: next });
    expect(r).toMatchObject({ fullName: "Deepak B", phone: "9876543210", email: next.toLowerCase() });
    expect((await queryOne<{ email: string }>("select email from auth.users where id = $1", [id]))!.email).toBe(next.toLowerCase());
    expect((await queryOne<{ email: string }>("select email from profiles where id = $1", [id]))!.email).toBe(next.toLowerCase());
  });

  it("refuses an email another account already uses", async () => {
    const taken = `taken-${randomUUID()}@test.local`;
    await newUser(taken);
    const id = await newUser(`me-${randomUUID()}@test.local`);
    await expect(adminUpdateUser(id, { fullName: "Someone", phone: null, email: taken.toUpperCase() })).rejects.toMatchObject({ status: 409, code: "EMAIL_TAKEN" });
  });

  it("keeps the email when only the name changes", async () => {
    const email = `same-${randomUUID()}@test.local`;
    const id = await newUser(email);
    const r = await adminUpdateUser(id, { fullName: "Only Name", phone: null, email });
    expect(r).toMatchObject({ email, fullName: "Only Name", phone: null });
  });
});
