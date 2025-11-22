/**
 * Auto-detection utilities for conversation parsers
 * Requirements: 4.4, 4.5
 */

import { ConversationParser } from './base';
import { ParserRegistry } from '../registry';

/**
 * Detection result containing the matched parser and confidence score
 */
export interface DetectionResult {
  parser: ConversationParser;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns: string[];
}

/**
 * Structural pattern for provider detection
 */
interface StructuralPattern {
  provider: string;
  requiredFields: string[];
  optionalFields?: string[];
  nestedChecks?: Array<{
    field: string;
    requiredSubFields: string[];
  }>;
}

/**
 * Known structural patterns for different providers
 * Requirements: 4.4, 4.5
 */
const PROVIDER_PATTERNS: StructuralPattern[] = [
  {
    provider: 'openai',
    requiredFields: ['mapping'],
    optionalFields: ['title', 'create_time', 'conversation_id'],
    nestedChecks: [
      {
        field: 'mapping',
        requiredSubFields: ['message', 'parent', 'children'],
      },
    ],
  },
  {
    provider: 'anthropic',
    requiredFields: ['uuid', 'chat_messages'],
    optionalFields: ['name', 'created_at'],
    nestedChecks: [
      {
        field: 'chat_messages',
        requiredSubFields: ['text', 'sender'],
      },
    ],
  },
];

/**
 * Detect provider from data using structural pattern matching
 * This provides an alternative detection method based on field patterns
 * Requirements: 4.4, 4.5
 * 
 * @param data - Raw data to analyze
 * @returns Provider name if detected, undefined otherwise
 */
export function detectProviderByStructure(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  for (const pattern of PROVIDER_PATTERNS) {
    if (matchesPattern(data, pattern)) {
      return pattern.provider;
    }
  }

  return undefined;
}

/**
 * Check if data matches a structural pattern
 * Requirements: 4.4, 4.5
 */
function matchesPattern(data: unknown, pattern: StructuralPattern): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, any>;

  // Check all required fields are present
  for (const field of pattern.requiredFields) {
    if (!(field in obj)) {
      return false;
    }
  }

  // Perform nested checks if specified
  if (pattern.nestedChecks) {
    for (const nestedCheck of pattern.nestedChecks) {
      const fieldValue = obj[nestedCheck.field];

      // For arrays, check first element
      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        const firstElement = fieldValue[0];
        if (typeof firstElement === 'object' && firstElement !== null) {
          const hasAllSubFields = nestedCheck.requiredSubFields.some((subField) =>
            subField in firstElement
          );
          if (!hasAllSubFields) {
            return false;
          }
        }
      }
      // For objects (like mapping), check if any value has required subfields
      else if (typeof fieldValue === 'object' && fieldValue !== null) {
        const values = Object.values(fieldValue);
        if (values.length > 0) {
          const hasMatch = values.some((value) => {
            if (typeof value === 'object' && value !== null) {
              return nestedCheck.requiredSubFields.some((subField) => subField in value);
            }
            return false;
          });
          if (!hasMatch) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

/**
 * Detect provider with confidence scoring
 * Tries each parser and returns detailed detection result
 * Requirements: 4.4, 4.5
 * 
 * @param data - Raw data to analyze
 * @param registry - Parser registry to use for detection
 * @returns Detection result with confidence score, or undefined if no match
 */
export function detectWithConfidence(
  data: unknown,
  registry: ParserRegistry
): DetectionResult | undefined {
  const matchedPatterns: string[] = [];

  // Try structural pattern matching first
  const structuralMatch = detectProviderByStructure(data);
  if (structuralMatch) {
    matchedPatterns.push(`structural:${structuralMatch}`);
  }

  // Try parser-based detection
  const parser = registry.detect(data);
  if (!parser) {
    return undefined;
  }

  matchedPatterns.push(`parser:${parser.provider}`);

  // Calculate confidence based on matches
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  // High confidence if both structural and parser match agree
  if (structuralMatch === parser.provider) {
    confidence = 'high';
  }
  // Low confidence if only parser matched (no structural match)
  else if (!structuralMatch) {
    confidence = 'low';
  }

  return {
    parser,
    confidence,
    matchedPatterns,
  };
}

/**
 * Try to detect provider from data and return the first matching parser
 * This is a convenience wrapper around registry.detect()
 * Requirements: 4.4, 4.5
 * 
 * @param data - Raw data to analyze
 * @param registry - Parser registry to use for detection
 * @returns Parser instance if detected, undefined otherwise
 */
export function autoDetectParser(
  data: unknown,
  registry: ParserRegistry
): ConversationParser | undefined {
  return registry.detect(data);
}

/**
 * Validate that data is parseable JSON
 * Requirements: 4.4
 * 
 * @param input - String or buffer to validate
 * @returns Parsed JSON object or undefined if invalid
 */
export function validateAndParseJSON(input: string | Buffer): unknown | undefined {
  try {
    const jsonString = typeof input === 'string' ? input : input.toString('utf-8');
    return JSON.parse(jsonString);
  } catch {
    return undefined;
  }
}

/**
 * Detect provider from file content
 * Combines JSON parsing and provider detection
 * Requirements: 4.4, 4.5
 * 
 * @param fileContent - File content as string or buffer
 * @param registry - Parser registry to use for detection
 * @returns Detection result or undefined if detection fails
 */
export function detectFromFile(
  fileContent: string | Buffer,
  registry: ParserRegistry
): DetectionResult | undefined {
  // Parse JSON
  const data = validateAndParseJSON(fileContent);
  if (!data) {
    return undefined;
  }

  // Detect provider
  return detectWithConfidence(data, registry);
}

/**
 * Get human-readable description of detection failure
 * Requirements: 4.5
 * 
 * @param data - Data that failed detection
 * @returns Error message describing why detection failed
 */
export function getDetectionFailureReason(data: unknown): string {
  if (data === null || data === undefined) {
    return 'Data is null or undefined';
  }

  if (typeof data !== 'object') {
    return `Data is not an object (type: ${typeof data})`;
  }

  if (Array.isArray(data)) {
    return 'Data is an array, expected an object';
  }

  const obj = data as Record<string, any>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    return 'Data is an empty object';
  }

  // Check against known patterns
  const missingFields: string[] = [];
  for (const pattern of PROVIDER_PATTERNS) {
    const missing = pattern.requiredFields.filter((field) => !(field in obj));
    if (missing.length > 0) {
      missingFields.push(`${pattern.provider}: missing ${missing.join(', ')}`);
    }
  }

  if (missingFields.length > 0) {
    return `No matching provider pattern found. ${missingFields.join('; ')}`;
  }

  return `Unknown format. Available fields: ${keys.slice(0, 5).join(', ')}${
    keys.length > 5 ? '...' : ''
  }`;
}
