/**
 * Anthropic Claude conversation parser
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 3.4
 */

import { BaseParser } from './base';
import { NormalizedConversation, NormalizedMessage } from '../types';

/**
 * Anthropic Claude export format interfaces
 * Based on Claude conversation export structure
 */
interface AnthropicExport {
  // Single conversation format
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ClaudeMessage[];
  
  // Multi-conversation format
  conversations?: AnthropicConversation[];
  
  [key: string]: any;
}

interface AnthropicConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ClaudeMessage[];
  [key: string]: any;
}

interface ClaudeMessage {
  uuid?: string;
  text?: string;
  sender?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

/**
 * Parser for Anthropic Claude conversation exports
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export class AnthropicParser extends BaseParser {
  readonly provider = 'anthropic';

  /**
   * Check if data matches Claude export structure
   * Requirements: 4.2
   */
  canParse(data: unknown): boolean {
    // Check for single conversation format
    if (this.hasProperty(data, 'uuid') && this.hasProperty(data, 'chat_messages')) {
      return true;
    }

    // Check for multi-conversation format (wrapped in conversations field)
    if (this.hasProperty(data, 'conversations')) {
      const conversations = this.getProperty<any[]>(data, 'conversations');
      if (Array.isArray(conversations) && conversations.length > 0) {
        // Verify first conversation has Claude structure
        const first = conversations[0];
        return this.hasProperty(first, 'uuid') && this.hasProperty(first, 'chat_messages');
      }
    }

    // Check for direct array format (Claude export format)
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      return (
        typeof first === 'object' &&
        first !== null &&
        'uuid' in first &&
        'chat_messages' in first
      );
    }

    return false;
  }

  /**
   * Parse Claude export into normalized conversations
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.3, 7.5
   */
  async parse(data: unknown): Promise<NormalizedConversation[]> {
    try {
      const conversations: NormalizedConversation[] = [];

      // Handle direct array format (Claude export format)
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          try {
            const conv = data[i];
            const normalized = this.parseConversation(conv);
            if (normalized) {
              conversations.push(normalized);
            }
          } catch (error) {
            // Log error with context but continue processing other conversations
            // Requirement 7.3: Include provider and error location
            // Requirement 7.5: Log parsing errors with sufficient context
            throw new Error(
              `Failed to parse conversation at index ${i}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
        return conversations;
      }

      const exportData = data as AnthropicExport;

      // Handle multi-conversation format (wrapped in conversations field)
      if (exportData.conversations && Array.isArray(exportData.conversations)) {
        for (let i = 0; i < exportData.conversations.length; i++) {
          try {
            const conv = exportData.conversations[i];
            const normalized = this.parseConversation(conv);
            if (normalized) {
              conversations.push(normalized);
            }
          } catch (error) {
            // Log error with context but continue processing other conversations
            // Requirement 7.3: Include provider and error location
            // Requirement 7.5: Log parsing errors with sufficient context
            throw new Error(
              `Failed to parse conversation at index ${i}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }
      // Handle single conversation format
      else if (exportData.chat_messages) {
        const normalized = this.parseConversation(exportData as AnthropicConversation);
        if (normalized) {
          conversations.push(normalized);
        }
      } else {
        // Requirement 7.3: Include provider and error location
        throw new Error(
          'Invalid Anthropic export format: missing "chat_messages" or "conversations" field'
        );
      }

      return conversations;
    } catch (error) {
      // Requirement 7.3: Include provider and error location
      // Requirement 7.5: Add context to all error messages
      throw new Error(
        `Anthropic parser error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse a single conversation from Claude format
   * Requirements: 2.1, 2.3, 2.4, 2.5, 7.3, 7.5
   */
  private parseConversation(conv: AnthropicConversation): NormalizedConversation | null {
    try {
      if (!conv.chat_messages || !Array.isArray(conv.chat_messages)) {
        return null;
      }

      // Parse messages
      const messages = this.extractMessages(conv.chat_messages);

      // Skip conversations with no messages
      if (messages.length === 0) {
        return null;
      }

      // Extract metadata
      const conversationId = this.generateId();
      const externalId = conv.uuid || null;
      const title = conv.name || null;
      const createdAt = this.normalizeTimestamp(conv.created_at || messages[0]?.created_at);
      const updatedAt = this.normalizeTimestamp(
        conv.updated_at || messages[messages.length - 1]?.created_at
      );

      // Build raw metadata (preserve provider-specific fields)
      const raw_metadata: Record<string, any> = {};
      for (const [key, value] of Object.entries(conv)) {
        if (!['uuid', 'name', 'created_at', 'updated_at', 'chat_messages'].includes(key)) {
          raw_metadata[key] = value;
        }
      }

      return {
        id: conversationId,
        provider: this.provider,
        external_id: externalId,
        title,
        created_at: createdAt,
        updated_at: updatedAt,
        messages,
        raw_metadata,
      };
    } catch (error) {
      // Requirement 7.3: Include provider and error location
      // Requirement 7.5: Add context to all error messages
      const convId = conv.uuid || 'unknown';
      throw new Error(
        `Failed to parse Anthropic conversation (uuid: ${convId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Extract and normalize messages from Claude format
   * Requirements: 2.2, 2.4, 2.5, 3.4
   */
  private extractMessages(chatMessages: ClaudeMessage[]): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];

    for (const message of chatMessages) {
      const normalizedMessage = this.normalizeMessage(message);
      if (normalizedMessage) {
        messages.push(normalizedMessage);
      }
    }

    return messages;
  }

  /**
   * Normalize a single Claude message
   * Requirements: 2.2, 2.5, 3.3, 3.4
   */
  private normalizeMessage(message: ClaudeMessage): NormalizedMessage | null {
    // Extract content - preserve exactly as provided
    const content = message.text || '';

    // Skip messages with no content
    if (!content.trim()) {
      return null;
    }

    // Extract and normalize role
    // Claude uses 'sender' field which can be 'human', 'assistant', etc.
    const role = message.sender || 'assistant';
    const normalizedRole = this.normalizeClaudeRole(role);

    // Generate timestamp
    const createdAt = this.normalizeTimestamp(message.created_at);

    // Build raw metadata
    const raw_metadata: Record<string, any> = {};
    for (const [key, value] of Object.entries(message)) {
      if (!['uuid', 'text', 'sender', 'created_at', 'updated_at'].includes(key)) {
        raw_metadata[key] = value;
      }
    }

    // Preserve original sender in metadata
    if (message.sender) {
      raw_metadata.original_sender = message.sender;
    }

    return {
      id: this.generateId(),
      role: normalizedRole,
      content,
      created_at: createdAt,
      raw_metadata,
    };
  }

  /**
   * Map Claude-specific message roles to standard roles
   * Requirements: 2.2, 3.4
   */
  private normalizeClaudeRole(sender: string): 'user' | 'assistant' | 'system' {
    const normalized = sender.toLowerCase().trim();

    // Claude-specific role mappings
    if (normalized === 'human' || normalized === 'user') {
      return 'user';
    }

    if (normalized === 'assistant' || normalized === 'claude') {
      return 'assistant';
    }

    if (normalized === 'system') {
      return 'system';
    }

    // Use base class normalization for other cases
    return this.normalizeRole(sender);
  }
}
