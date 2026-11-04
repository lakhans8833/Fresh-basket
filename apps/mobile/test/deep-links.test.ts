/** FB-37: (a) an OAuth ?code= reaching auth-callback is exchanged (once); (b) the payment return link
 *  freshbasket://orders/<id> arriving twice doesn't open a second copy of the order screen. */
import { describe, expect, it, vi } from "vitest";
import { createCodeExchanger, createOrderLinkFilter } from "../src/lib/deep-links";

describe("(a) OAuth code exchange", () => {
  it("exchanges a code that arrives at auth-callback; the same code (or one already being exchanged) only once", async () => {
    let finish!: () => void;
    const exchange = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    const run = createCodeExchanger(exchange);
    const first = run("code-1"); // e.g. signInWithGoogle got it back from the browser session
    const second = run("code-1"); // …and the system ALSO opened freshbasket://auth-callback?code=code-1
    expect(exchange).toHaveBeenCalledTimes(1);
    finish();
    expect(await first).toBe("exchanged");
    expect(await second).toBe("already_handled");
    expect(await run("code-1")).toBe("already_handled");
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("a failed exchange reports the error and can be retried with a new code", async () => {
    const exchange = vi.fn(async (c: string) => { if (c === "bad") throw new Error("invalid flow state"); });
    const run = createCodeExchanger(exchange);
    await expect(run("bad")).rejects.toThrow("invalid flow state");
    expect(await run("good")).toBe("exchanged");
  });
});

describe("(b) payment return link", () => {
  it("the same order link twice within a few seconds → the second is dropped (screen refreshed instead)", () => {
    let t = 1_000;
    const refreshed: string[] = [];
    const f = createOrderLinkFilter({ now: () => t, onDuplicate: (id) => refreshed.push(id) });
    expect(f("/orders/abc?paid=1")).toBe("/orders/abc?paid=1");
    t += 800;
    expect(f("freshbasket://orders/abc")).toBe(null);
    expect(refreshed).toEqual(["abc"]);
    t += 20_000;
    expect(f("/orders/abc")).toBe("/orders/abc"); // much later: a real new visit
    expect(f("/orders/other")).toBe("/orders/other");
    expect(f("/product/tomato")).toBe("/product/tomato");
  });

  it("a link to the order already on screen isn't pushed again", () => {
    const refreshed: string[] = [];
    const f = createOrderLinkFilter({ onDuplicate: (id) => refreshed.push(id) });
    f.setVisibleOrder("abc");
    expect(f("/orders/abc")).toBe(null);
    expect(refreshed).toEqual(["abc"]);
    f.setVisibleOrder(null);
    expect(f("/orders/abc")).toBe("/orders/abc");
  });
});
