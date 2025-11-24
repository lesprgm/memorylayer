/**
 * OpenAI LLM Provider implementation
 */

import OpenAI from 'openai';
import { LLMProvider } from './base.js';
import { JSONSchema, ModelParams, FunctionDefinition, FunctionCallResult } from '../types.js';
import { ExtractionError, Result } from '../errors.js';

export interface OpenAIProviderConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

/**
 * Queued request for rate limit handling
 */
interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  context: string;
}

/**
 * OpenAI provider implementation with retry logic and error handling
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private retryConfig: RetryConfig;
  private requestQueue: QueuedRequest<any>[] = [];
  private isProcessingQueue: boolean = false;
  private rateLimitResetTime: number = 0;

  constructor(config: OpenAIProviderConfig, retryConfig?: RetryConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
      maxRetries: 0, // We handle retries ourselves
      timeout: config.timeout,
    });
    this.retryConfig = retryConfig || DEFAULT_RETRY_CONFIG;
  }

  /**
   * Call OpenAI with a prompt and get text response
   */
  async complete(prompt: string, params: ModelParams): Promise<string> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: params.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: params.temperature,
          max_tokens: params.maxTokens,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw this.createError('parse_error', 'No content in OpenAI response');
        }

        return content;
      } catch (error) {
        throw this.handleOpenAIError(error, 'complete');
      }
    }, 'complete');
  }

  /**
   * Call OpenAI with structured output using response_format
   */
  async completeStructured<T>(
    prompt: string,
    schema: JSONSchema,
    params: ModelParams
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: params.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw this.createError('parse_error', 'No content in OpenAI response');
        }

        // Clean up response - handle various markdown formats
        let cleanedContent = this.cleanMarkdownJson(content);

        try {
          const parsed = JSON.parse(cleanedContent) as T;
          return parsed;
        } catch (parseError) {
          throw this.createError(
            'parse_error',
            'Failed to parse JSON response from OpenAI',
            content
          );
        }
      } catch (error) {
        throw this.handleOpenAIError(error, 'completeStructured');
      }
    }, 'completeStructured');
  }

  /**
   * Call OpenAI with function calling
   */
  async completeWithFunctions(
    prompt: string,
    functions: FunctionDefinition[],
    params: ModelParams
  ): Promise<FunctionCallResult> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: params.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          tools: functions.map((fn) => ({
            type: 'function' as const,
            function: {
              name: fn.name,
              description: fn.description,
              parameters: fn.parameters,
            },
          })),
          tool_choice: 'auto',
        });

        const toolCall = response.choices[0]?.message?.tool_calls?.[0];
        if (!toolCall || toolCall.type !== 'function') {
          throw this.createError('parse_error', 'No function call in OpenAI response');
        }

        try {
          const args = JSON.parse(toolCall.function.arguments);
          return {
            functionName: toolCall.function.name,
            arguments: args,
          };
        } catch (parseError) {
          throw this.createError(
            'parse_error',
            'Failed to parse function arguments from OpenAI',
            toolCall.function.arguments
          );
        }
      } catch (error) {
        throw this.handleOpenAIError(error, 'completeWithFunctions');
      }
    }, 'completeWithFunctions');
  }

  /**
   * Execute a function with exponential backoff retry logic and rate limit queue
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, context: string = 'unknown'): Promise<T> {
    // Check if we're currently rate limited
    if (this.rateLimitResetTime > Date.now()) {
      // Queue the request for later processing
      return this.queueRequest(fn, context);
    }

    let attempt = 0;
    let delay = this.retryConfig.initialDelay;

    while (attempt <= this.retryConfig.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        // If it's a rate limit error, handle with queue
        if (this.isRateLimitError(error)) {
          const retryAfter = this.getRateLimitDelay(error);
          this.rateLimitResetTime = Date.now() + retryAfter;
          
          if (attempt < this.retryConfig.maxRetries) {
            // Queue this request and process queue after rate limit expires
            this.scheduleQueueProcessing(retryAfter);
            return this.queueRequest(fn, context);
          }
        }

        // For other errors, retry with exponential backoff
        if (attempt < this.retryConfig.maxRetries && this.isRetryableError(error)) {
          await this.sleep(delay);
          delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelay);
          attempt++;
          continue;
        }

        // No more retries, throw the error
        throw error;
      }
    }

    throw this.createError('llm_error', `Max retries exceeded for ${context}`);
  }

  /**
   * Queue a request for later processing when rate limited
   */
  private queueRequest<T>(fn: () => Promise<T>, context: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({
        fn,
        resolve,
        reject,
        context,
      });
    });
  }

  /**
   * Schedule queue processing after rate limit expires
   */
  private scheduleQueueProcessing(delayMs: number): void {
    if (this.isProcessingQueue) {
      return; // Already scheduled
    }

    this.isProcessingQueue = true;
    
    setTimeout(() => {
      this.processQueue();
    }, delayMs);
  }

  /**
   * Process queued requests after rate limit expires
   */
  private async processQueue(): Promise<void> {
    while (this.requestQueue.length > 0 && this.rateLimitResetTime <= Date.now()) {
      const request = this.requestQueue.shift();
      if (!request) break;

      try {
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }

      // Small delay between queued requests to avoid immediate re-rate-limiting
      await this.sleep(100);
    }

    this.isProcessingQueue = false;

    // If there are still queued requests and we're rate limited again, reschedule
    if (this.requestQueue.length > 0 && this.rateLimitResetTime > Date.now()) {
      this.scheduleQueueProcessing(this.rateLimitResetTime - Date.now());
    }
  }

  /**
   * Handle OpenAI-specific errors and convert to ExtractionError with context
   */
  private handleOpenAIError(error: unknown, operation: string = 'unknown'): ExtractionError {
    // If already an ExtractionError, return it
    if (this.isExtractionError(error)) {
      return error;
    }

    // Handle OpenAI SDK errors
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        const retryAfter = this.extractRetryAfter(error) || 60000;
        return { type: 'rate_limit', retryAfter };
      }

      return {
        type: 'llm_error',
        provider: this.name,
        message: `OpenAI API error during ${operation}: ${error.message} (status: ${error.status})`,
        cause: error,
      };
    }

    // Handle generic errors
    if (error instanceof Error) {
      return {
        type: 'llm_error',
        provider: this.name,
        message: `Error during ${operation}: ${error.message}`,
        cause: error,
      };
    }

    return {
      type: 'llm_error',
      provider: this.name,
      message: `Unknown error occurred during ${operation}`,
      cause: error,
    };
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (this.isExtractionError(error)) {
      return error.type === 'rate_limit';
    }
    if (error instanceof OpenAI.APIError) {
      return error.status === 429;
    }
    return false;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      // Retry on server errors and rate limits
      return error.status >= 500 || error.status === 429;
    }
    return false;
  }

  /**
   * Get retry delay from rate limit error
   */
  private getRateLimitDelay(error: unknown): number {
    if (this.isExtractionError(error) && error.type === 'rate_limit') {
      return error.retryAfter;
    }
    if (error instanceof OpenAI.APIError) {
      return this.extractRetryAfter(error) || 60000;
    }
    return 60000; // Default 60 seconds
  }

  /**
   * Extract retry-after value from OpenAI error
   */
  private extractRetryAfter(error: any): number | null {
    const retryAfterHeader = error.headers?.['retry-after'];
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000; // Convert to milliseconds
      }
    }
    return null;
  }

  /**
   * Clean markdown formatting from JSON response
   * Handles various formats:
   * - Simple code blocks: ```json ... ```
   * - Code blocks with headers: # Title\n```json ... ```
   * - Multiple code blocks: extracts and merges JSON arrays into proper structure
   */
  private cleanMarkdownJson(content: string): string {
    let cleaned = content.trim();
    
    // Check if response contains markdown code blocks
    if (cleaned.includes('```')) {
      // Extract all JSON code blocks with their preceding headers
      const sectionRegex = /##\s+(\w+)\s*\n+```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
      const matches = [...cleaned.matchAll(sectionRegex)];
      
      if (matches.length > 0) {
        // Build structured output from sections
        const result: any = {
          memories: [],
          relationships: []
        };
        
        for (const match of matches) {
          const sectionName = match[1].toLowerCase();
          const blockContent = match[2].trim();
          
          try {
            const parsed = JSON.parse(blockContent);
            
            // Map section names to our structure
            if (sectionName === 'entities' || sectionName === 'facts' || sectionName === 'decisions') {
              // These are memory types - add them to memories array
              if (Array.isArray(parsed)) {
                for (const item of parsed) {
                  result.memories.push({
                    type: sectionName === 'entities' ? 'entity' : 
                          sectionName === 'facts' ? 'fact' : 'decision',
                    content: this.extractMemoryContent(item, sectionName),
                    confidence: item.confidence || 0.8,
                    metadata: this.extractMemoryMetadata(item, sectionName)
                  });
                }
              }
            } else if (sectionName === 'relationships') {
              // Relationships section
              if (Array.isArray(parsed)) {
                result.relationships = parsed.map((rel: any) => ({
                  from_memory_index: rel.from_memory_index || 0,
                  to_memory_index: rel.to_memory_index || 0,
                  relationship_type: rel.relationship_type || rel.relationship || 'related_to',
                  confidence: rel.confidence || 0.8
                }));
              }
            }
          } catch (e) {
            // Skip invalid JSON blocks
          }
        }
        
        return JSON.stringify(result);
      }
      
      // Fallback: try simple code block extraction
      const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
      const simpleMatches = [...cleaned.matchAll(jsonBlockRegex)];
      
      if (simpleMatches.length > 0) {
        cleaned = simpleMatches[0][1].trim();
      }
    }
    
    // Remove any remaining markdown headers or formatting
    cleaned = cleaned.replace(/^#+\s+.*$/gm, ''); // Remove headers
    cleaned = cleaned.replace(/^\*\*.*\*\*$/gm, ''); // Remove bold text lines
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  /**
   * Extract content from a memory item based on its type
   */
  private extractMemoryContent(item: any, sectionName: string): string {
    if (sectionName === 'entities') {
      return item.name || item.content || JSON.stringify(item);
    } else if (sectionName === 'facts') {
      return item.statement || item.content || JSON.stringify(item);
    } else if (sectionName === 'decisions') {
      return item.decision || item.content || JSON.stringify(item);
    }
    return item.content || JSON.stringify(item);
  }

  /**
   * Extract metadata from a memory item
   */
  private extractMemoryMetadata(item: any, sectionName: string): Record<string, any> {
    // Keep all fields in metadata - the validator expects them there
    const metadata: Record<string, any> = { ...item };
    
    // Remove only confidence as it's extracted separately
    delete metadata.confidence;
    
    return metadata;
  }

  /**
   * Check if error is an ExtractionError
   */
  private isExtractionError(error: unknown): error is ExtractionError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      typeof (error as any).type === 'string'
    );
  }

  /**
   * Create an ExtractionError
   */
  private createError(
    type: 'llm_error' | 'parse_error',
    message: string,
    rawResponse?: string
  ): ExtractionError {
    if (type === 'parse_error') {
      return { type: 'parse_error', message, rawResponse };
    }
    return { type: 'llm_error', provider: this.name, message };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
