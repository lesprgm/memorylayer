/**
 * Context templates for formatting memories
 */

import type { ContextTemplate } from './types';
import type { SearchResult } from './types';

/**
 * Default context templates for common use cases
 */
export const DEFAULT_TEMPLATES: Record<string, ContextTemplate> = {
  chat: {
    name: 'chat',
    header: 'Relevant context from past conversations:\n\n',
    memoryFormat: '- {{content}}',
    separator: '\n',
    footer: '\n',
    includeMetadata: false,
  },
  detailed: {
    name: 'detailed',
    header: 'Relevant memories:\n\n',
    memoryFormat: '[{{type}}] {{content}} (confidence: {{confidence}}, {{timestamp}})',
    separator: '\n\n',
    footer: '\n',
    includeMetadata: true,
  },
  summary: {
    name: 'summary',
    header: 'Key information:\n',
    memoryFormat: '{{content}}',
    separator: ' | ',
    footer: '',
    includeMetadata: false,
  },
};

/**
 * Substitute template variables with actual values from a search result
 * 
 * Supported variables:
 * - {{content}}: Memory content
 * - {{type}}: Memory type
 * - {{confidence}}: Confidence score
 * - {{timestamp}}: Created at timestamp
 * - {{score}}: Similarity score
 * 
 * @param template - Template string with variables
 * @param result - Search result to extract values from
 * @param includeMetadata - Whether to include metadata in output
 * @returns Formatted string with variables substituted
 */
export function substituteTemplateVariables(
  template: string,
  result: SearchResult,
  includeMetadata: boolean
): string {
  let output = template;

  // Always substitute content
  output = output.replace(/\{\{content\}\}/g, result.memory.content);

  // Conditionally substitute metadata based on includeMetadata flag
  if (includeMetadata) {
    output = output.replace(/\{\{type\}\}/g, result.memory.type);
    output = output.replace(/\{\{confidence\}\}/g, result.memory.confidence.toFixed(2));
    output = output.replace(/\{\{timestamp\}\}/g, formatTimestamp(result.memory.created_at));
    output = output.replace(/\{\{score\}\}/g, result.score.toFixed(3));
  } else {
    // Remove metadata placeholders if includeMetadata is false
    output = output.replace(/\{\{type\}\}/g, '');
    output = output.replace(/\{\{confidence\}\}/g, '');
    output = output.replace(/\{\{timestamp\}\}/g, '');
    output = output.replace(/\{\{score\}\}/g, '');
  }

  return output;
}

/**
 * Format a timestamp for display
 * 
 * @param date - Date to format
 * @returns Formatted timestamp string
 */
function formatTimestamp(date: Date): string {
  return date.toISOString();
}
