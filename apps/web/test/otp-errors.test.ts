import { describe, expect, it } from "vitest";
import { sendErrorMessage, verifyErrorMessage, waitSeconds } from "@/lib/client/otp-errors";

describe("email-code sign-in messages", () => {
  it("wrong / expired / used codes (Supabase's otp_expired) get one clear message", () => {
    const m = verifyErrorMessage({ code: "otp_expired", status: 403, message: "Token has expired or is invalid" });
    expect(m).toMatch(/wrong, has expired or was already used/);
  });
  it("network failures are not reported as a wrong code", () => {
    const m = verifyErrorMessage({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" });
    expect(m).toMatch(/Couldn't reach/);
    expect(sendErrorMessage({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" })).toMatch(/Couldn't reach/);
  });
  it("send rate limit shows the seconds Supabase asks for", () => {
    const e = { code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 42 seconds." };
    expect(waitSeconds(e)).toBe(42);
    expect(sendErrorMessage(e)).toBe("Too many code requests. Please wait 42 seconds and try again.");
  });
  it("hourly email limit without seconds → 'a minute', server errors → retry later", () => {
    expect(sendErrorMessage({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" })).toMatch(/wait a minute/);
    expect(sendErrorMessage({ status: 500, message: "Error sending magic link email" })).toMatch(/problem sending the email/);
  });
  it("sign-ups disabled is explained", () => {
    expect(sendErrorMessage({ code: "signup_disabled", status: 422, message: "Signups not allowed for otp" })).toMatch(/sign-ups are turned off/);
  });
});
