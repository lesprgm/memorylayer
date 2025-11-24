/**
 * Base ExtractionStrategy interface
 */

import {
  ExtractionStrategy,
  NormalizedConversation,
  NormalizedMessage,
  StrategyConfig,
  RawExtractionResult,
  IncrementalContext
} from '../types.js';

export type { ExtractionStrategy, StrategyConfig, RawExtractionResult };

/**
 * Re-export the ExtractionStrategy interface for convenience
 * 
 * Strategies implement different approaches to memory extraction:
 * - StructuredOutputStrategy: Uses LLM structured output (most reliable)
 * - PromptBasedStrategy: Uses carefully crafted prompts
 * - FunctionCallStrategy: Uses function calling
 */
