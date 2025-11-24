/**
 * ChunkingOrchestrator - Coordinates conversation chunking and extraction
 */

import type { NormalizedConversation } from '../types.js';
import type { Logger } from '../types.js';
import { TokenCounter } from './token-counter.js';
import type {
  ChunkingConfig,
  ChunkingStrategy,
  ChunkedExtractionResult,
  ChunkExtractionResult,
  ConversationChunk,
} from './types.js';

/**
 * Orchestrates the chunking and extraction process for large conversations
 */
export class ChunkingOrchestrator {
  private tokenCounter: TokenCounter;
  private strategies: Map<string, ChunkingStrategy>;
  private logger?: Logger;

  constructor(
    tokenCounter: TokenCounter,
    strategies: Map<string, ChunkingStrategy>,
    logger?: Logger
  ) {
    this.tokenCounter = tokenCounter;
    this.strategies = strategies;
    this.logger = logger;
  }

  /**
   * Determine if a conversation needs chunking based on token count
   * 
   * @param conversation - The conversation to check
   * @param config - Chunking configuration
   * @returns True if the conversation exceeds the token limit
   */
  needsChunking(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): boolean {
    // Count tokens in the conversation
    const result = this.tokenCounter.countConversation(
      conversation,
      config.tokenCountMethod
    );

    const needsChunking = result.tokens > config.maxTokensPerChunk;

    if (this.logger) {
      if (needsChunking) {
        this.logger.info(
          `Conversation ${conversation.id} needs chunking: ${result.tokens} tokens exceeds limit of ${config.maxTokensPerChunk}`,
          {
            conversationId: conversation.id,
            totalTokens: result.tokens,
            maxTokensPerChunk: config.maxTokensPerChunk,
            tokenCountMethod: result.method,
            accuracy: result.accuracy,
          }
        );
      } else {
        this.logger.debug(
          `Conversation ${conversation.id} does not need chunking: ${result.tokens} tokens within limit of ${config.maxTokensPerChunk}`,
          {
            conversationId: conversation.id,
            totalTokens: result.tokens,
            maxTokensPerChunk: config.maxTokensPerChunk,
          }
        );
      }
    }

    return needsChunking;
  }

  /**
   * Select the appropriate chunking strategy based on configuration
   * 
   * @param conversation - The conversation to chunk
   * @param config - Chunking configuration
   * @returns The selected chunking strategy
   * @throws Error if no suitable strategy is found
   */
  selectStrategy(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): ChunkingStrategy {
    // Determine strategy name
    let strategyName: string;
    
    if (config.strategy === 'custom' && config.customStrategyName) {
      strategyName = config.customStrategyName;
    } else {
      strategyName = config.strategy;
    }

    // Get strategy from registry
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      const availableStrategies = Array.from(this.strategies.keys()).join(', ');
      const errorMsg = `Chunking strategy '${strategyName}' not found. Available strategies: ${availableStrategies}`;
      
      if (this.logger) {
        this.logger.error(errorMsg, {
          requestedStrategy: strategyName,
          availableStrategies: Array.from(this.strategies.keys()),
        });
      }
      
      throw new Error(errorMsg);
    }

    // Validate that the strategy can handle this conversation
    if (!strategy.canHandle(conversation, config)) {
      const errorMsg = `Strategy '${strategyName}' cannot handle conversation ${conversation.id}`;
      
      if (this.logger) {
        this.logger.error(errorMsg, {
          conversationId: conversation.id,
          strategy: strategyName,
          messageCount: conversation.messages.length,
        });
      }
      
      throw new Error(errorMsg);
    }

    if (this.logger) {
      this.logger.info(
        `Selected chunking strategy '${strategyName}' for conversation ${conversation.id}`,
        {
          conversationId: conversation.id,
          strategy: strategyName,
          messageCount: conversation.messages.length,
        }
      );
    }

    return strategy;
  }

  /**
   * Chunk a conversation using the configured strategy
   * 
   * @param conversation - The conversation to chunk
   * @param config - Chunking configuration
   * @returns Array of conversation chunks
   */
  chunkConversation(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): ConversationChunk[] {
    const startTime = Date.now();

    // Select strategy
    const strategy = this.selectStrategy(conversation, config);

    if (this.logger) {
      this.logger.debug(
        `Chunking conversation ${conversation.id} with strategy '${strategy.name}'`,
        {
          conversationId: conversation.id,
          strategy: strategy.name,
          messageCount: conversation.messages.length,
          maxTokensPerChunk: config.maxTokensPerChunk,
        }
      );
    }

    // Perform chunking
    const chunks = strategy.chunk(conversation, config);

    const duration = Date.now() - startTime;

    if (this.logger) {
      this.logger.info(
        `Chunked conversation ${conversation.id} into ${chunks.length} chunks in ${duration}ms`,
        {
          conversationId: conversation.id,
          strategy: strategy.name,
          chunkCount: chunks.length,
          duration,
          averageTokensPerChunk: chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length,
        }
      );
    }

    return chunks;
  }

  /**
   * Register a new chunking strategy
   * 
   * @param strategy - The strategy to register
   */
  registerStrategy(strategy: ChunkingStrategy): void {
    if (this.strategies.has(strategy.name)) {
      if (this.logger) {
        this.logger.warn(
          `Overwriting existing chunking strategy '${strategy.name}'`,
          { strategyName: strategy.name }
        );
      }
    }

    this.strategies.set(strategy.name, strategy);

    if (this.logger) {
      this.logger.info(
        `Registered chunking strategy '${strategy.name}'`,
        { strategyName: strategy.name }
      );
    }
  }

  /**
   * Get all registered strategy names
   * 
   * @returns Array of strategy names
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get a specific strategy by name
   * 
   * @param name - The strategy name
   * @returns The strategy, or undefined if not found
   */
  getStrategy(name: string): ChunkingStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Process chunks in parallel (for independent chunks)
   * 
   * @param chunks - Array of conversation chunks to process
   * @param workspaceId - The workspace ID
   * @param extractionStrategy - The extraction strategy to use
   * @param strategyConfig - Configuration for the extraction strategy
   * @param failureMode - How to handle chunk failures ('fail-fast' or 'continue-on-error')
   * @param maxConcurrency - Maximum number of chunks to process in parallel (default: 3)
   * @returns Array of chunk extraction results
   */
  async processChunksParallel(
    chunks: ConversationChunk[],
    workspaceId: string,
    extractionStrategy: any, // ExtractionStrategy type
    strategyConfig: any, // StrategyConfig type
    failureMode: 'fail-fast' | 'continue-on-error' = 'continue-on-error',
    maxConcurrency: number = 3
  ): Promise<ChunkExtractionResult[]> {
    if (this.logger) {
      this.logger.info(
        `Starting parallel processing of ${chunks.length} chunks with concurrency ${maxConcurrency}`,
        {
          totalChunks: chunks.length,
          maxConcurrency,
          failureMode,
        }
      );
    }

    const results: ChunkExtractionResult[] = [];
    const errors: Error[] = [];

    // Process chunks in batches to limit concurrency
    for (let i = 0; i < chunks.length; i += maxConcurrency) {
      const batch = chunks.slice(i, i + maxConcurrency);
      
      if (this.logger) {
        this.logger.debug(
          `Processing batch ${Math.floor(i / maxConcurrency) + 1} of ${Math.ceil(chunks.length / maxConcurrency)}`,
          {
            batchSize: batch.length,
            startChunk: i + 1,
            endChunk: Math.min(i + maxConcurrency, chunks.length),
          }
        );
      }

      const batchPromises = batch.map(chunk => this.processChunk(
        chunk,
        workspaceId,
        extractionStrategy,
        strategyConfig
      ));

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        if (failureMode === 'fail-fast') {
          if (this.logger) {
            this.logger.error(
              `Fail-fast mode enabled, stopping parallel chunk processing`,
              {
                processedChunks: results.length,
                totalChunks: chunks.length,
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            );
          }
          throw error;
        }

        // In continue-on-error mode, collect individual results
        const settledResults = await Promise.allSettled(batchPromises);
        for (let j = 0; j < settledResults.length; j++) {
          const result = settledResults[j];
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const chunk = batch[j];
            if (this.logger) {
              this.logger.error(
                `Failed to process chunk ${chunk.sequence}`,
                {
                  chunkId: chunk.id,
                  error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
                }
              );
            }
            
            // Create failed result
            results.push({
              chunkId: chunk.id,
              sequence: chunk.sequence,
              status: 'failed',
              memories: [],
              relationships: [],
              tokenCount: chunk.tokenCount,
              processingTime: 0,
              error: {
                type: 'llm_error',
                provider: strategyConfig.provider?.name || 'unknown',
                message: result.reason instanceof Error ? result.reason.message : 'Unknown error',
                cause: result.reason,
              },
            });
            
            errors.push(result.reason);
          }
        }
      }
    }

    if (this.logger) {
      const successCount = results.filter(r => r.status === 'success').length;
      const failureCount = results.filter(r => r.status === 'failed').length;

      this.logger.info(
        `Completed parallel chunk processing`,
        {
          totalChunks: chunks.length,
          successCount,
          failureCount,
          totalMemories: results.reduce((sum, r) => sum + r.memories.length, 0),
          totalRelationships: results.reduce((sum, r) => sum + r.relationships.length, 0),
        }
      );
    }

    return results;
  }

  /**
   * Process a single chunk
   * 
   * @param chunk - The chunk to process
   * @param workspaceId - The workspace ID
   * @param extractionStrategy - The extraction strategy to use
   * @param strategyConfig - Configuration for the extraction strategy
   * @param previousContext - Optional context from previous chunk (for sequential processing)
   * @returns Chunk extraction result
   */
  private async processChunk(
    chunk: ConversationChunk,
    workspaceId: string,
    extractionStrategy: any,
    strategyConfig: any,
    previousContext?: any
  ): Promise<ChunkExtractionResult> {
    const startTime = Date.now();

    if (this.logger) {
      this.logger.debug(
        `Processing chunk ${chunk.sequence} of ${chunk.totalChunks}`,
        {
          chunkId: chunk.id,
          sequence: chunk.sequence,
          messageCount: chunk.messages.length,
          tokenCount: chunk.tokenCount,
        }
      );
    }

    try {
      // Check if the strategy supports chunk extraction
      let rawResult;
      if (typeof extractionStrategy.extractFromChunk === 'function') {
        // Use chunk-aware extraction with previous context
        rawResult = await extractionStrategy.extractFromChunk(
          chunk.messages,
          chunk.conversationId,
          workspaceId,
          chunk.id,
          strategyConfig,
          previousContext
        );
      } else {
        // Fallback to regular extraction without chunk context
        if (this.logger) {
          this.logger.warn(
            `Strategy ${extractionStrategy.name} does not support chunk extraction, using regular extraction`,
            { chunkId: chunk.id }
          );
        }

        // Create a temporary conversation for this chunk
        const chunkConversation = {
          id: chunk.conversationId,
          messages: chunk.messages,
          metadata: {},
        };

        rawResult = await extractionStrategy.extract(
          chunkConversation,
          workspaceId,
          strategyConfig
        );
      }

      const processingTime = Date.now() - startTime;

      if (this.logger) {
        this.logger.info(
          `Successfully processed chunk ${chunk.sequence}`,
          {
            chunkId: chunk.id,
            memoriesExtracted: rawResult.memories.length,
            relationshipsExtracted: rawResult.relationships.length,
            processingTime,
          }
        );
      }

      // Create successful result
      return {
        chunkId: chunk.id,
        sequence: chunk.sequence,
        status: 'success',
        memories: rawResult.memories,
        relationships: rawResult.relationships,
        tokenCount: chunk.tokenCount,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (this.logger) {
        this.logger.error(
          `Failed to process chunk ${chunk.sequence}`,
          {
            chunkId: chunk.id,
            sequence: chunk.sequence,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime,
          }
        );
      }

      // Create failed result
      return {
        chunkId: chunk.id,
        sequence: chunk.sequence,
        status: 'failed',
        memories: [],
        relationships: [],
        tokenCount: chunk.tokenCount,
        processingTime,
        error: {
          type: 'llm_error',
          provider: strategyConfig.provider?.name || 'unknown',
          message: error instanceof Error ? error.message : 'Unknown error',
          cause: error,
        },
      };
    }
  }

  /**
   * Process chunks sequentially and extract memories from each
   * 
   * @param chunks - Array of conversation chunks to process
   * @param workspaceId - The workspace ID
   * @param extractionStrategy - The extraction strategy to use
   * @param strategyConfig - Configuration for the extraction strategy
   * @param failureMode - How to handle chunk failures ('fail-fast' or 'continue-on-error')
   * @returns Array of chunk extraction results
   */
  async processChunksSequentially(
    chunks: ConversationChunk[],
    workspaceId: string,
    extractionStrategy: any, // ExtractionStrategy type
    strategyConfig: any, // StrategyConfig type
    failureMode: 'fail-fast' | 'continue-on-error' = 'continue-on-error'
  ): Promise<ChunkExtractionResult[]> {
    const results: ChunkExtractionResult[] = [];
    let previousChunkContext: any = undefined; // ChunkContext type

    if (this.logger) {
      this.logger.info(
        `Starting sequential processing of ${chunks.length} chunks`,
        {
          totalChunks: chunks.length,
          failureMode,
        }
      );
    }

    for (const chunk of chunks) {
      const result = await this.processChunk(
        chunk,
        workspaceId,
        extractionStrategy,
        strategyConfig,
        previousChunkContext
      );

      results.push(result);

      // Handle failure mode
      if (result.status === 'failed' && failureMode === 'fail-fast') {
        if (this.logger) {
          this.logger.error(
            `Fail-fast mode enabled, stopping chunk processing`,
            {
              failedChunk: chunk.id,
              processedChunks: results.length,
              totalChunks: chunks.length,
            }
          );
        }
        throw result.error?.cause || new Error('Chunk processing failed');
      }

      // Update context for next chunk (only if successful)
      if (result.status === 'success') {
        if (typeof extractionStrategy.createChunkSummary === 'function') {
          const summary = extractionStrategy.createChunkSummary(
            chunk.messages,
            result.memories
          );

          previousChunkContext = {
            chunkId: chunk.id,
            sequence: chunk.sequence,
            summary,
            extractedMemories: result.memories.map((m: any) => ({
              type: m.type,
              content: m.content,
            })),
          };
        } else {
          // Create basic context without summary function
          previousChunkContext = {
            chunkId: chunk.id,
            sequence: chunk.sequence,
            summary: `Chunk ${chunk.sequence}: ${chunk.messages.length} messages, ${result.memories.length} memories extracted`,
            extractedMemories: result.memories.map((m: any) => ({
              type: m.type,
              content: m.content,
            })),
          };
        }
      } else if (this.logger) {
        // Continue processing remaining chunks
        this.logger.warn(
          `Continue-on-error mode enabled, proceeding to next chunk`,
          {
            failedChunk: chunk.id,
            remainingChunks: chunks.length - chunk.sequence,
          }
        );
      }
    }

    if (this.logger) {
      const successCount = results.filter(r => r.status === 'success').length;
      const failureCount = results.filter(r => r.status === 'failed').length;

      this.logger.info(
        `Completed sequential chunk processing`,
        {
          totalChunks: chunks.length,
          successCount,
          failureCount,
          totalMemories: results.reduce((sum, r) => sum + r.memories.length, 0),
          totalRelationships: results.reduce((sum, r) => sum + r.relationships.length, 0),
        }
      );
    }

    return results;
  }

  /**
   * Aggregate results from multiple chunks into a single result
   * 
   * @param chunkResults - Array of chunk extraction results
   * @param conversationId - The conversation ID
   * @param totalTokens - Total tokens in the conversation
   * @param strategyName - Name of the chunking strategy used
   * @param timingBreakdown - Optional timing breakdown
   * @returns Aggregated chunked extraction result
   */
  aggregateChunkResults(
    chunkResults: ChunkExtractionResult[],
    conversationId: string,
    totalTokens: number,
    strategyName: string,
    timingBreakdown?: {
      chunking: number;
      extraction: number;
      deduplication: number;
    }
  ): ChunkedExtractionResult {
    if (this.logger) {
      this.logger.debug(
        `Aggregating results from ${chunkResults.length} chunks`,
        {
          conversationId,
          totalChunks: chunkResults.length,
        }
      );
    }

    // Collect all memories from successful chunks
    const allMemories: any[] = [];
    const allRelationships: any[] = [];

    for (const result of chunkResults) {
      if (result.status === 'success') {
        allMemories.push(...result.memories);
        allRelationships.push(...result.relationships);
      }
    }

    // Calculate total processing time
    const totalProcessingTime = chunkResults.reduce(
      (sum, r) => sum + r.processingTime,
      0
    );

    // Build timing breakdown
    const timing = timingBreakdown
      ? {
          chunking: timingBreakdown.chunking,
          extraction: timingBreakdown.extraction,
          deduplication: timingBreakdown.deduplication,
          total: timingBreakdown.chunking + timingBreakdown.extraction + timingBreakdown.deduplication,
        }
      : {
          chunking: 0,
          extraction: totalProcessingTime,
          deduplication: 0,
          total: totalProcessingTime,
        };

    const result: ChunkedExtractionResult = {
      memories: allMemories,
      relationships: allRelationships,
      chunks: chunkResults,
      totalTokens,
      chunkingStrategy: strategyName,
      processingTime: timing.total,
      timingBreakdown: timing,
    };

    if (this.logger) {
      const successCount = chunkResults.filter(r => r.status === 'success').length;
      const failureCount = chunkResults.filter(r => r.status === 'failed').length;

      // Calculate chunk size statistics
      const chunkSizes = chunkResults.map(r => r.tokenCount);
      const minChunkSize = Math.min(...chunkSizes);
      const maxChunkSize = Math.max(...chunkSizes);
      const avgChunkSize = chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length;

      // Calculate extraction rate (memories per chunk)
      const memoriesPerChunk = chunkResults
        .filter(r => r.status === 'success')
        .map(r => r.memories.length);
      const avgMemoriesPerChunk = memoriesPerChunk.length > 0
        ? memoriesPerChunk.reduce((sum, count) => sum + count, 0) / memoriesPerChunk.length
        : 0;

      this.logger.info(
        `Aggregated chunk results`,
        {
          conversationId,
          totalChunks: chunkResults.length,
          successfulChunks: successCount,
          failedChunks: failureCount,
          totalMemories: allMemories.length,
          totalRelationships: allRelationships.length,
          totalProcessingTime: timing.total,
          timingBreakdown: {
            chunking: timing.chunking,
            extraction: timing.extraction,
            deduplication: timing.deduplication,
          },
          chunkMetrics: {
            minChunkSize,
            maxChunkSize,
            avgChunkSize: Math.round(avgChunkSize),
            avgMemoriesPerChunk: Math.round(avgMemoriesPerChunk * 100) / 100,
          },
        }
      );
    }

    return result;
  }
}
