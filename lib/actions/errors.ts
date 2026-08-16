import type { ZodIssue } from "zod";

export type ActionError =
  | { ok: false; error: "UNAUTHORIZED" }
  | { ok: false; error: "FORBIDDEN"; required: "VIEWER" | "EDITOR" | "ADMIN" }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "VALIDATION_ERROR"; issues?: ZodIssue[]; message?: string }
  | { ok: false; error: "CONFLICT" }
  | { ok: false; error: "LAST_ADMIN" }
  | { ok: false; error: "LAST_OWNER" }
  | { ok: false; error: "AI_UNAVAILABLE"; message: string };

export type ActionResult<T> = { ok: true; data: T } | ActionError;

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function unauthorized(): ActionError {
  return { ok: false, error: "UNAUTHORIZED" };
}

export function forbidden(required: "VIEWER" | "EDITOR" | "ADMIN"): ActionError {
  return { ok: false, error: "FORBIDDEN", required };
}

export function notFound(): ActionError {
  return { ok: false, error: "NOT_FOUND" };
}

export function validationError(message: string, issues?: ZodIssue[]): ActionError {
  return { ok: false, error: "VALIDATION_ERROR", message, issues };
}

export function aiUnavailable(message: string): ActionError {
  return { ok: false, error: "AI_UNAVAILABLE", message };
}
