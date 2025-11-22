/**
 * Core types for chat capture and normalization
 */

/**
 * Normalized conversation format used internally by MemoryLayer
 * Requirements: 3.1
 */
export interface NormalizedConversation {
  /** Local UUID */
  id: string;
  /** Provider identifier (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Provider's conversation ID */
  external_id: string | null;
  /** Conversation title */
  title: string | null;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
  /** Array of messages in the conversation */
  messages: NormalizedMessage[];
  /** Provider-specific fields that don't map to standard fields */
  raw_metadata: Record<string, any>;
}

/**
 * Normalized message format
 * Requirements: 3.2
 */
export interface NormalizedMessage {
  /** Local UUID */
  id: string;
  /** Message role - normalized to standard values */
  role: 'user' | 'assistant' | 'system';
  /** Message content - preserved exactly as provided */
  content: string;
  /** ISO 8601 timestamp */
  created_at: string;
  /** Provider-specific message metadata */
  raw_metadata: Record<string, any>;
}

/**
 * Configuration for ChatCapture instance
 */
export interface ChatCaptureConfig {
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSize?: number;
  /** Maximum conversations per file (default: 1000) */
  maxConversationsPerFile?: number;
  /** Enable automatic provider detection (default: true) */
  enableAutoDetection?: boolean;
  /** Optional logger instance */
  logger?: Logger;
}

/**
 * Options for parsing operations
 */
export interface ParseOptions {
  /** Fail on first validation error (default: false) */
  strict?: boolean;
  /** Skip invalid conversations and return valid ones (default: false) */
  skipInvalid?: boolean;
}

/**
 * Logger interface for custom logging implementations
 */
export interface Logger {
  error(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  debug(message: string, context?: Record<string, any>): void;
}
