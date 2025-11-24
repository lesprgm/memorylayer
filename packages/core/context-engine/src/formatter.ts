/**
 * Context formatter for applying templates to search results
 */

import type { Tokenizer } from './tokenizer';
import type { ContextTemplate, SearchResult, ContextResult } from './types';
import { substituteTemplateVariables } from './templates';

/**
 * ContextFormatter applies templates to search results and manages token budgets
 */
export class ContextFormatter {
  constructor(private readonly tokenizer: Tokenizer) {}

  /**
   * Format memories using a template and respect token budget
   * 
   * @param memories - Search results to format
   * @param template - Template to apply
   * @param tokenBudget - Maximum tokens allowed
   * @returns Context result with formatted string and metadata
   * @throws Error if template or tokenBudget are invalid
   */
  format(
    memories: SearchResult[],
    template: ContextTemplate,
    tokenBudget: number
  ): ContextResult {
    // Validate inputs
    if (!template) {
      throw new Error('Template is required');
    }
    
    if (!template.memoryFormat) {
      throw new Error('Template memoryFormat is required');
    }
    
    if (tokenBudget <= 0) {
      throw new Error(`Token budget must be positive, got ${tokenBudget}`);
    }
    
    if (!Array.isArray(memories)) {
      throw new Error('Memories must be an array');
    }
    
    // Truncate memories to fit within budget
    const fittedMemories = this.truncateToFit(memories, template, tokenBudget);
    const truncated = fittedMemories.length < memories.length;

    // Build the formatted context string
    const parts: string[] = [];

    // Add header if present
    if (template.header) {
      parts.push(template.header);
    }

    // Format each memory
    const formattedMemories = fittedMemories.map((result) =>
      substituteTemplateVariables(
        template.memoryFormat,
        result,
        template.includeMetadata
      )
    );

    // Join memories with separator
    if (formattedMemories.length > 0) {
      parts.push(formattedMemories.join(template.separator));
    }

    // Add footer if present
    if (template.footer) {
      parts.push(template.footer);
    }

    // Combine all parts
    const context = parts.join('');

    // Calculate final token count
    const tokenCount = this.estimateTokens(context);

    return {
      context,
      tokenCount,
      memories: fittedMemories,
      truncated,
      template: template.name,
    };
  }

  /**
   * Estimate token count for text using the configured tokenizer
   * 
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  estimateTokens(text: string): number {
    if (!text) {
      return 0;
    }
    
    try {
      return this.tokenizer.count(text);
    } catch (error) {
      // Fallback to character-based estimation if tokenizer fails
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Truncate memories to fit within token budget
   * Keeps highest-ranked memories (assumes memories are already ranked)
   * 
   * @param memories - Search results to truncate
   * @param template - Template to apply for estimation
   * @param tokenBudget - Maximum tokens allowed
   * @returns Truncated array of search results that fit within budget
   */
  truncateToFit(
    memories: SearchResult[],
    template: ContextTemplate,
    tokenBudget: number
  ): SearchResult[] {
    // Handle empty memories array
    if (!memories || memories.length === 0) {
      return [];
    }
    
    // Calculate base overhead from template header and footer
    let currentTokens = 0;
    
    if (template.header) {
      currentTokens += this.estimateTokens(template.header);
    }
    
    if (template.footer) {
      currentTokens += this.estimateTokens(template.footer);
    }
    
    // If header and footer already exceed budget, return empty
    if (currentTokens > tokenBudget) {
      return [];
    }

    const result: SearchResult[] = [];

    // Add memories one by one until budget is exceeded
    for (let i = 0; i < memories.length; i++) {
      const memory = memories[i];
      
      // Skip invalid memories
      if (!memory || !memory.memory) {
        continue;
      }
      
      try {
        // Format this memory to estimate its token cost
        const formattedMemory = substituteTemplateVariables(
          template.memoryFormat,
          memory,
          template.includeMetadata
        );
        
        const memoryTokens = this.estimateTokens(formattedMemory);
        
        // Add separator tokens if this isn't the first memory
        const separatorTokens = result.length > 0 ? this.estimateTokens(template.separator) : 0;
        
        const totalNewTokens = memoryTokens + separatorTokens;
        
        // Check if adding this memory would exceed budget
        if (currentTokens + totalNewTokens > tokenBudget) {
          // Budget exceeded, stop here
          break;
        }
        
        // Add this memory and update token count
        result.push(memory);
        currentTokens += totalNewTokens;
      } catch (error) {
        // Skip memories that fail to format
        continue;
      }
    }

    return result;
  }
}
