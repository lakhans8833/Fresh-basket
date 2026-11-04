/** Admin → Users → Edit: name, mobile and sign-in email (local auth mode; Supabase uses the Auth admin API). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { queryOne } from "@/lib/db";
import { adminConfirmEmail, adminCreateResetLink, adminSetPassword, adminSetRole, adminUpdateUser } from "@/lib/admin/users";

const newUser = async (email: string) =>
  (await queryOne<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))!.id;

/** The admin doing the edit (a different account from every target below). */
const ACTOR = "00000000-0000-4000-8000-00000000ac70";

describe("adminUpdateUser", () => {
  it("changes name, mobile and the sign-in email (auth + profile)", async () => {
    const id = await newUser(`old-${randomUUID()}@test.local`);
    const next = `New.${randomUUID()}@Test.Local`;
    const r = await adminUpdateUser(ACTOR, id, { fullName: "  Deepak B ", phone: "9876543210", email: next });
    expect(r).toMatchObject({ fullName: "Deepak B", phone: "9876543210", email: next.toLowerCase() });
    expect((await queryOne<{ email: string }>("select email from auth.users where id = $1", [id]))!.email).toBe(next.toLowerCase());
    expect((await queryOne<{ email: string }>("select email from profiles where id = $1", [id]))!.email).toBe(next.toLowerCase());
  });

  it("refuses an email another account already uses", async () => {
    const taken = `taken-${randomUUID()}@test.local`;
    await newUser(taken);
    const id = await newUser(`me-${randomUUID()}@test.local`);
    await expect(adminUpdateUser(ACTOR, id, { fullName: "Someone", phone: null, email: taken.toUpperCase() })).rejects.toMatchObject({ status: 409, code: "EMAIL_TAKEN" });
  });

  it("keeps the email when only the name changes", async () => {
    const email = `same-${randomUUID()}@test.local`;
    const id = await newUser(email);
    const r = await adminUpdateUser(ACTOR, id, { fullName: "Only Name", phone: null, email });
    expect(r).toMatchObject({ email, fullName: "Only Name", phone: null });
  });
});

describe("admins can't take over another admin (only an owner listed in ADMIN_EMAILS can)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const newAdmin = async (email: string, confirmed = true) => {
    const id = (await queryOne<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at) values ($1, ${confirmed ? "now()" : "null"}) returning id`, [email],
    ))!.id;
    await queryOne("update profiles set role = 'admin' where id = $1", [id]);
    return id;
  };

  it("a non-owner admin is refused (403) on another admin's email, role, reset link and password", async () => {
    vi.stubEnv("ADMIN_EMAILS", `owner-${randomUUID()}@test.local`);
    const owner = await newAdmin(`target-${randomUUID()}@test.local`);
    const second = await newAdmin(`second-${randomUUID()}@test.local`);
    await expect(adminUpdateUser(second, owner, { fullName: "Owner", phone: null, email: `attacker-${randomUUID()}@evil.test` })).rejects.toMatchObject({ status: 403 });
    await expect(adminSetRole(second, owner, "customer")).rejects.toMatchObject({ status: 403 });
    await expect(adminCreateResetLink(second, owner, "https://shop.example")).rejects.toMatchObject({ status: 403 });
    await expect(adminSetPassword(second, owner, "new-password-123")).rejects.toMatchObject({ status: 403 });
    const row = await queryOne<{ email: string; role: string }>("select u.email, p.role from auth.users u join profiles p on p.id = u.id where u.id = $1", [owner]);
    expect(row!.role).toBe("admin");
    expect(row!.email).toMatch(/^target-/);
    // Name / mobile edits (no email change) of another admin are still fine.
    await expect(adminUpdateUser(second, owner, { fullName: "Owner Name", phone: null, email: row!.email })).resolves.toMatchObject({ fullName: "Owner Name" });
  });

  it("an owner (confirmed email in ADMIN_EMAILS) can demote another admin; an unconfirmed listed address can't", async () => {
    const ownerEmail = `owner-${randomUUID()}@test.local`;
    const unconfirmedEmail = `pending-${randomUUID()}@test.local`;
    vi.stubEnv("ADMIN_EMAILS", ` ${ownerEmail.toUpperCase()} , ${unconfirmedEmail}`);
    const owner = await newAdmin(ownerEmail);
    const pending = await newAdmin(unconfirmedEmail, false);
    const other = await newAdmin(`other-${randomUUID()}@test.local`);
    await expect(adminSetRole(pending, other, "staff")).rejects.toMatchObject({ status: 403 });
    await expect(adminSetRole(owner, other, "staff")).resolves.toMatchObject({ role: "staff" });
  });

  it("customers and staff can still be managed by any admin", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    const admin = await newAdmin(`plain-${randomUUID()}@test.local`);
    const customer = await newUser(`cust-${randomUUID()}@test.local`);
    await expect(adminSetRole(admin, customer, "staff")).resolves.toMatchObject({ role: "staff" });
    await expect(adminSetRole(admin, customer, "customer")).resolves.toMatchObject({ role: "customer" });
  });

  it("confirming an email from Admin reports whether the sign-up password was cleared (local mode: no passwords)", async () => {
    const id = (await queryOne<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`unconf-${randomUUID()}@test.local`]))!.id;
    const r = await adminConfirmEmail(id);
    expect(r.passwordReset).toBe(false);
    expect(r.emailConfirmedAt).toBeTruthy();
  });
});
