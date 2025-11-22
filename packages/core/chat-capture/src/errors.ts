/**
 * Error types and Result type for chat capture operations
 * Requirements: 7.1, 7.2
 */

/**
 * Validation error details
 */
export interface ValidationError {
  /** Field that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** Conversation ID if applicable */
  conversationId?: string;
  /** Message ID if applicable */
  messageId?: string;
}

/**
 * Typed errors for chat capture operations
 * Requirements: 7.1, 7.2
 */
export type CaptureError =
  | {
      type: 'parse_error';
      provider: string;
      message: string;
      cause?: unknown;
    }
  | {
      type: 'validation_error';
      errors: ValidationError[];
    }
  | {
      type: 'provider_not_found';
      provider: string;
    }
  | {
      type: 'file_too_large';
      size: number;
      limit: number;
    }
  | {
      type: 'too_many_conversations';
      count: number;
      limit: number;
    }
  | {
      type: 'detection_failed';
      message: string;
    };

/**
 * Result type for operations that can fail
 * Provides type-safe error handling
 */
export type Result<T, E = CaptureError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Helper to create a successful result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Helper to create an error result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
