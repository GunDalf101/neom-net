import { describe, expect, it } from "vitest";
import { HttpError } from "../errors.js";
import { rateLimit } from "./rateLimit.js";
import { CLIENT_HEADER, csrfGuard } from "./security.js";

type Headers = Record<string, string | undefined>;
function fakeReq(method: string, headers: Headers = {}, ip = "1.2.3.4") {
  const h: Headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, ip, headers: h, protocol: "https", get: (k: string) => h[k.toLowerCase()] } as never;
}
function fakeRes() {
  const headers: Record<string, string> = {};
  const handlers: Record<string, (() => void)[]> = {};
  return {
    statusCode: 200,
    headers,
    setHeader: (k: string, v: string) => (headers[k] = v),
    on: (ev: string, fn: () => void) => (handlers[ev] ??= []).push(fn),
    finish(status: number) {
      this.statusCode = status;
      for (const fn of handlers.finish ?? []) fn();
    },
  };
}
const run = (mw: (req: never, res: never, next: (e?: unknown) => void) => void, req: unknown, res: unknown) =>
  new Promise<unknown>((resolve) => mw(req as never, res as never, (e) => resolve(e)));

describe("csrfGuard", () => {
  const guard = csrfGuard({ allowedOrigins: ["http://localhost:5174"], cookieName: "neom_session" });
  const host = { host: "neom-net.onrender.com" };

  it("lets safe methods through untouched", async () => {
    expect(await run(guard, fakeReq("GET", { ...host, cookie: "neom_session=x", origin: "https://evil.example" }), fakeRes())).toBeUndefined();
  });
  it("blocks a mutating request from a foreign origin", async () => {
    const err = (await run(guard, fakeReq("POST", { ...host, origin: "https://evil.example", [CLIENT_HEADER]: "web" }), fakeRes())) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
  });
  it("falls back to Referer when Origin is absent", async () => {
    const err = (await run(guard, fakeReq("DELETE", { ...host, referer: "https://evil.example/page", [CLIENT_HEADER]: "web" }), fakeRes())) as HttpError;
    expect(err?.status).toBe(403);
  });
  it("accepts same-origin and configured origins", async () => {
    expect(await run(guard, fakeReq("POST", { ...host, origin: "https://neom-net.onrender.com", cookie: "neom_session=x", [CLIENT_HEADER]: "web" }), fakeRes())).toBeUndefined();
    expect(await run(guard, fakeReq("POST", { host: "localhost:4000", origin: "http://localhost:5174", cookie: "neom_session=x", [CLIENT_HEADER]: "web" }), fakeRes())).toBeUndefined();
  });
  it("requires the client header once a session cookie is present (a plain form cannot set it)", async () => {
    const err = (await run(guard, fakeReq("POST", { ...host, origin: "https://neom-net.onrender.com", cookie: "neom_session=x" }), fakeRes())) as HttpError;
    expect(err?.status).toBe(403);
    expect(err?.message).toMatch(/client header/i);
  });
  it("does not require the header before login", async () => {
    expect(await run(guard, fakeReq("POST", { ...host, origin: "https://neom-net.onrender.com" }), fakeRes())).toBeUndefined();
  });
});

describe("rateLimit", () => {
  it("allows `max` attempts per window, then answers 429 with Retry-After, and resets after the window", async () => {
    let t = 1_000_000;
    const limiter = rateLimit({ name: "t", windowMs: 60_000, max: 3, now: () => t });
    for (let i = 0; i < 3; i++) expect(await run(limiter, fakeReq("POST"), fakeRes())).toBeUndefined();
    const res = fakeRes();
    const err = (await run(limiter, fakeReq("POST"), res)) as HttpError;
    expect(err.status).toBe(429);
    expect(err.code).toBe("rate_limited");
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0);
    expect(res.headers["RateLimit-Remaining"]).toBe("0");
    t += 60_001;
    expect(await run(limiter, fakeReq("POST"), fakeRes())).toBeUndefined();
  });
  it("keys per client: another IP is unaffected", async () => {
    const limiter = rateLimit({ name: "t", windowMs: 60_000, max: 1 });
    expect(await run(limiter, fakeReq("POST", {}, "10.0.0.1"), fakeRes())).toBeUndefined();
    expect(((await run(limiter, fakeReq("POST", {}, "10.0.0.1"), fakeRes())) as HttpError).status).toBe(429);
    expect(await run(limiter, fakeReq("POST", {}, "10.0.0.2"), fakeRes())).toBeUndefined();
  });
  it("failuresOnly counts 4xx responses and ignores successes", async () => {
    const limiter = rateLimit({ name: "login", windowMs: 60_000, max: 2, failuresOnly: true });
    for (let i = 0; i < 5; i++) {
      const res = fakeRes();
      expect(await run(limiter, fakeReq("POST"), res)).toBeUndefined();
      res.finish(200);
    }
    for (let i = 0; i < 2; i++) {
      const res = fakeRes();
      expect(await run(limiter, fakeReq("POST"), res)).toBeUndefined();
      res.finish(401);
    }
    expect(((await run(limiter, fakeReq("POST"), fakeRes())) as HttpError).status).toBe(429);
  });
  it("custom keys (e.g. the login identifier) and missing keys", async () => {
    const limiter = rateLimit({ name: "id", windowMs: 60_000, max: 1, key: (req) => (req as { body?: { id?: string } }).body?.id });
    const withId = (id?: string) => ({ ...(fakeReq("POST") as object), body: { id } });
    expect(await run(limiter, withId("alice"), fakeRes())).toBeUndefined();
    expect(((await run(limiter, withId("alice"), fakeRes())) as HttpError).status).toBe(429);
    expect(await run(limiter, withId("bob"), fakeRes())).toBeUndefined();
    expect(await run(limiter, withId(undefined), fakeRes())).toBeUndefined();
  });
});
