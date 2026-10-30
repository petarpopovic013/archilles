import type { z } from "zod";
import type { ApiError } from "../../src/domain";

/** An expected failure with a stable code; maps to the standard `{ code, message, retryable }` body. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiFailure";
  }

  toBody(): ApiError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export const notFound = (entity: string) =>
  new ApiFailure(404, "NOT_FOUND", `${entity} not found`);

export const revisionConflict = (current: number, base: number) =>
  new ApiFailure(409, "REVISION_CONFLICT", "The base revision is stale", false, { currentRevision: current, baseRevision: base });

export const invalidInput = (error: z.ZodError) =>
  new ApiFailure(422, "INVALID_INPUT", "Request validation failed", false, {
    issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
