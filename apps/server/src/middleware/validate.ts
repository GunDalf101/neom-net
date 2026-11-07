import type { ZodTypeAny, z } from "zod";
import { badRequest } from "../errors.js";

/** Parses and returns typed input, throwing a 400 with field details on failure. */
export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest(
      "Validation failed",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}
