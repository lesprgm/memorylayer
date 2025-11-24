/**
 * Google Gemini LLM Provider implementation
 */

import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { LLMProvider } from './base.js';
import { JSONSchema, ModelParams, FunctionDefinition, FunctionCallResult } from '../types.js';
import { ExtractionError } from '../errors.js';

export interface GeminiProviderConfig {
  apiKey: string;
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
 * Google Gemini provider implementation with retry logic and error handling
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI;
  private retryConfig: RetryConfig;
  private requestQueue: QueuedRequest<any>[] = [];
  private isProcessingQueue: boolean = false;
  private rateLimitResetTime: number = 0;
  private defaultModel: string;

  constructor(config: GeminiProviderConfig, retryConfig?: RetryConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.retryConfig = retryConfig || DEFAULT_RETRY_CONFIG;
    this.defaultModel = config.defaultModel || 'gemini-3-pro-preview';
  }

  /**
   * Get a Gemini model instance with safety settings
   */
  private getModel(modelName: string): GenerativeModel {
    return this.client.getGenerativeModel({
      model: modelName,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });
  }

  /**
   * Call Gemini with a prompt and get text response
   */
  async complete(prompt: string, params: ModelParams): Promise<string> {
    return this.executeWithRetry(async () => {
      try {
        const model = this.getModel(params.model || this.defaultModel);
        
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: params.temperature,
            maxOutputTokens: params.maxTokens,
          },
        });

        const response = result.response;
        const text = response.text();
        
        if (!text) {
          throw this.createError('parse_error', 'No content in Gemini response');
        }

        return text;
      } catch (error) {
        throw this.handleGeminiError(error, 'complete');
      }
    }, 'complete');
  }

  /**
   * Call Gemini with structured output (JSON)
   */
  async completeStructured<T>(
    prompt: string,
    schema: JSONSchema,
    params: ModelParams
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      try {
        const model = this.getModel(params.model || this.defaultModel);
        
        // Add JSON formatting instruction to prompt
        const jsonPrompt = `${prompt}\n\nRespond with valid JSON only. Do not include any markdown formatting or code blocks. Return raw JSON.`;
        
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: jsonPrompt }] }],
          generationConfig: {
            temperature: params.temperature,
            maxOutputTokens: params.maxTokens,
          },
        });

        const response = result.response;
        let text = response.text();
        
        if (!text) {
          throw this.createError('parse_error', 'No content in Gemini response');
        }

        // Clean up response - remove markdown code blocks if present
        text = text.trim();
        if (text.startsWith('```json')) {
          text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (text.startsWith('```')) {
          text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        try {
          const parsed = JSON.parse(text) as T;
          return parsed;
        } catch (parseError) {
          throw this.createError(
            'parse_error',
            'Failed to parse JSON response from Gemini',
            text
          );
        }
      } catch (error) {
        throw this.handleGeminiError(error, 'completeStructured');
      }
    }, 'completeStructured');
  }

  /**
   * Call Gemini with function calling
   */
  async completeWithFunctions(
    prompt: string,
    functions: FunctionDefinition[],
    params: ModelParams
  ): Promise<FunctionCallResult> {
    return this.executeWithRetry(async () => {
      try {
        const model = this.getModel(params.model || this.defaultModel);
        
        // Convert function definitions to Gemini format
        const tools = [{
          functionDeclarations: functions.map(fn => ({
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters as any, // Cast to any to handle type mismatch
          })),
        }];
        
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: tools as any, // Cast to any to handle type mismatch
          generationConfig: {
            temperature: params.temperature,
            maxOutputTokens: params.maxTokens,
          },
        });

        const response = result.response;
        const functionCall = response.functionCalls()?.[0];
        
        if (!functionCall) {
          throw this.createError('parse_error', 'No function call in Gemini response');
        }

        return {
          functionName: functionCall.name,
          arguments: functionCall.args as Record<string, any>,
        };
      } catch (error) {
        throw this.handleGeminiError(error, 'completeWithFunctions');
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
   * Handle Gemini-specific errors and convert to ExtractionError with context
   */
  private handleGeminiError(error: unknown, operation: string = 'unknown'): ExtractionError {
    // If already an ExtractionError, return it
    if (this.isExtractionError(error)) {
      return error;
    }

    // Handle Gemini SDK errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      // Check for rate limit errors
      if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('quota')) {
        return { type: 'rate_limit', retryAfter: 60000 };
      }

      return {
        type: 'llm_error',
        provider: this.name,
        message: `Gemini API error during ${operation}: ${error.message}`,
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
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') || message.includes('429') || message.includes('quota');
    }
    return false;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Retry on server errors and rate limits
      return message.includes('500') || message.includes('503') || 
             message.includes('rate limit') || message.includes('429');
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
    return 60000; // Default 60 seconds
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
