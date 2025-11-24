/**
 * Error types for Context Engine operations
 */

export type ContextError =
  | { type: 'embedding_error'; message: string; cause?: unknown }
  | { type: 'search_error'; message: string; cause?: unknown }
  | { type: 'storage_error'; message: string; cause?: unknown }
  | { type: 'validation_error'; message: string }
  | { type: 'template_not_found'; template: string; message: string };

/**
 * Result type for operations that can fail
 */
export type Result<T, E> = 
  | { ok: true; value: T } 
  | { ok: false; error: E };
