/**
 * Base LLM Provider interface
 */

import { JSONSchema, ModelParams, FunctionDefinition, FunctionCallResult } from '../types.js';

/**
 * LLM Provider interface for different LLM services
 */
export interface LLMProvider {
  /**
   * Call LLM with a prompt and get text response
   */
  complete(prompt: string, params: ModelParams): Promise<string>;
  
  /**
   * Call LLM with structured output (JSON schema)
   */
  completeStructured<T>(prompt: string, schema: JSONSchema, params: ModelParams): Promise<T>;
  
  /**
   * Call LLM with function calling
   */
  completeWithFunctions(
    prompt: string,
    functions: FunctionDefinition[],
    params: ModelParams
  ): Promise<FunctionCallResult>;
  
  /**
   * Provider name identifier
   */
  readonly name: string;
}
