import type { ApiError } from "../../domain";

/** A failed API call with the standard `{ code, message, retryable, details? }` body. */
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
  }
}

export const isRevisionConflict = (error: unknown): boolean =>
  error instanceof ArchillesApiError && error.code === "REVISION_CONFLICT";
