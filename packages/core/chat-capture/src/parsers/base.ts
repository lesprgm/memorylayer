/**
 * Base parser interface and abstract class for conversation parsers
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6
 */

import { randomUUID } from 'crypto';
import { NormalizedConversation } from '../types';

/**
 * Interface that all conversation parsers must implement
 * Requirements: 4.1, 4.2
 */
export interface ConversationParser {
  /**
   * Parse raw data into normalized conversation format
   * @param data - Raw data from provider export or API
   * @returns Array of normalized conversations
   */
  parse(data: unknown): Promise<NormalizedConversation[]>;

  /**
   * Check if this parser can handle the given data
   * Used for auto-detection of provider format
   * @param data - Raw data to check
   * @returns true if this parser can handle the data
   */
  canParse(data: unknown): boolean;

  /**
   * Provider identifier (e.g., 'openai', 'anthropic')
   */
  readonly provider: string;
}

/**
 * Abstract base class providing common functionality for parsers
 * Requirements: 4.1, 4.2, 4.3
 */
export abstract class BaseParser implements ConversationParser {
  abstract parse(data: unknown): Promise<NormalizedConversation[]>;
  abstract canParse(data: unknown): boolean;
  abstract readonly provider: string;

  /**
   * Generate a unique ID for conversations or messages
   * @returns UUID v4 string
   */
  protected generateId(): string {
    return randomUUID();
  }

  /**
   * Normalize a timestamp to ISO 8601 format
   * Requirements: 3.3
   * @param timestamp - Timestamp in various formats (number, string, Date)
   * @returns ISO 8601 formatted string
   */
  protected normalizeTimestamp(timestamp: unknown): string {
    if (typeof timestamp === 'number') {
      // Unix timestamp (seconds or milliseconds)
      const date = timestamp > 10000000000 
        ? new Date(timestamp) 
        : new Date(timestamp * 1000);
      return date.toISOString();
    }

    if (typeof timestamp === 'string') {
      // Try to parse as date string
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }

    // Fallback to current time if timestamp is invalid
    return new Date().toISOString();
  }

  /**
   * Normalize message role to standard values
   * Requirements: 3.4
   * @param role - Provider-specific role string
   * @returns Normalized role ('user', 'assistant', or 'system')
   */
  protected normalizeRole(role: string): 'user' | 'assistant' | 'system' {
    const normalized = role.toLowerCase().trim();

    // Map common variations to standard roles
    if (normalized === 'user' || normalized === 'human') {
      return 'user';
    }

    if (
      normalized === 'assistant' ||
      normalized === 'ai' ||
      normalized === 'bot' ||
      normalized === 'model'
    ) {
      return 'assistant';
    }

    if (normalized === 'system') {
      return 'system';
    }

    // Default to assistant for unknown roles
    return 'assistant';
  }

  /**
   * Helper to check if an object has a specific property
   * @param obj - Object to check
   * @param prop - Property name
   * @returns true if property exists
   */
  protected hasProperty(obj: unknown, prop: string): boolean {
    return typeof obj === 'object' && obj !== null && prop in obj;
  }

  /**
   * Helper to safely get a property value from an object
   * @param obj - Object to get property from
   * @param prop - Property name
   * @returns Property value or undefined
   */
  protected getProperty<T = unknown>(obj: unknown, prop: string): T | undefined {
    if (this.hasProperty(obj, prop)) {
      return (obj as Record<string, T>)[prop];
    }
    return undefined;
  }
}
