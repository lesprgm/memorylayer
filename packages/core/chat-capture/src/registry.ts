/**
 * Parser registry for managing conversation parsers
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6
 */

import { ConversationParser } from './parsers/base';

/**
 * Registry for managing conversation parsers
 * Allows runtime registration and retrieval of parsers
 * Requirements: 4.1, 4.2, 4.5
 */
export class ParserRegistry {
  private parsers: Map<string, ConversationParser> = new Map();

  /**
   * Register a parser for a specific provider
   * Requirements: 4.2, 4.6
   * @param provider - Provider identifier (e.g., 'openai', 'anthropic')
   * @param parser - Parser instance
   */
  register(provider: string, parser: ConversationParser): void {
    const normalizedProvider = provider.toLowerCase().trim();
    this.parsers.set(normalizedProvider, parser);
  }

  /**
   * Get a parser by provider name
   * Requirements: 4.3
   * @param provider - Provider identifier
   * @returns Parser instance or undefined if not found
   */
  get(provider: string): ConversationParser | undefined {
    const normalizedProvider = provider.toLowerCase().trim();
    return this.parsers.get(normalizedProvider);
  }

  /**
   * Auto-detect provider from data by trying each parser's canParse method
   * Requirements: 4.4, 4.5
   * @param data - Raw data to detect provider for
   * @returns Parser instance that can handle the data, or undefined if none match
   */
  detect(data: unknown): ConversationParser | undefined {
    // Try each registered parser in order
    for (const parser of this.parsers.values()) {
      if (parser.canParse(data)) {
        return parser;
      }
    }
    return undefined;
  }

  /**
   * List all registered provider identifiers
   * @returns Array of provider names
   */
  listProviders(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Check if a provider is registered
   * @param provider - Provider identifier
   * @returns true if provider is registered
   */
  has(provider: string): boolean {
    const normalizedProvider = provider.toLowerCase().trim();
    return this.parsers.has(normalizedProvider);
  }

  /**
   * Remove a parser from the registry
   * @param provider - Provider identifier
   * @returns true if parser was removed, false if not found
   */
  unregister(provider: string): boolean {
    const normalizedProvider = provider.toLowerCase().trim();
    return this.parsers.delete(normalizedProvider);
  }

  /**
   * Clear all registered parsers
   */
  clear(): void {
    this.parsers.clear();
  }

  /**
   * Get the number of registered parsers
   * @returns Number of parsers
   */
  get size(): number {
    return this.parsers.size;
  }
}
