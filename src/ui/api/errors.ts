import type { ApiError } from "./types";

/**
 * Standard typed API error representing server-side or contract failures
 * corresponding to Tech.MD specification: { code, message, retryable, details? }
 */
export class ArchillesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ArchillesApiError";
    this.status = status;
    this.code = error.code;
    this.retryable = error.retryable;
    this.details = error.details;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ArchillesApiError.prototype);
  }
}

/** Check if the error is a 409 revision conflict */
export function isRevisionConflict(error: unknown): boolean {
  return (
    error instanceof ArchillesApiError &&
    (error.status === 409 || error.code === "REVISION_CONFLICT")
  );
}

/** Check if the error is a 422 validation failure */
export function isValidationError(error: unknown): boolean {
  return (
    error instanceof ArchillesApiError &&
    (error.status === 422 || error.code === "VALIDATION_ERROR")
  );
}

/** Check if the error indicates runtime or provider unviability (503) */
export function isServiceUnavailable(error: unknown): boolean {
  return (
    error instanceof ArchillesApiError &&
    (error.status === 503 || error.retryable === true)
  );
}
