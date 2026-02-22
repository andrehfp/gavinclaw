import type { ToolError } from "./types.js";

export const ERROR_CODES = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const toolError = (code: ErrorCode, message: string, details?: unknown): ToolError => ({
  ok: false,
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details })
  }
});

export const fromUnknownError = (error: unknown): ToolError => {
  if (error instanceof Error) {
    return toolError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  return toolError(ERROR_CODES.INTERNAL_ERROR, "Unexpected internal error", { error });
};
