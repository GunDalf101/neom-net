import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "./logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "bad_request", details);
export const unauthorized = (msg = "Authentication required") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "You are not allowed to do that") => new HttpError(403, msg, "forbidden");
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`, "not_found");
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, "conflict", details);
export const ruleViolation = (msg: string, details?: unknown) => new HttpError(422, msg, "rule_violation", details);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "validation",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  const anyErr = err as { code?: string; message?: string };
  if (anyErr?.code === "P2002") {
    res.status(409).json({ error: "That value is already taken", code: "conflict" });
    return;
  }
  if (anyErr?.code === "P2025") {
    res.status(404).json({ error: "Resource not found", code: "not_found" });
    return;
  }
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: "Internal server error", code: "internal" });
}

/** Wraps an async route so rejections reach the error handler. */
export function wrap<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };
}
