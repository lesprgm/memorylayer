/**
 * Tests for auto-detection utilities
 * Requirements: 4.4, 4.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectProviderByStructure,
  detectWithConfidence,
  autoDetectParser,
  validateAndParseJSON,
  detectFromFile,
  getDetectionFailureReason,
} from '../detector';
import { ParserRegistry } from '../../registry';
import { OpenAIParser } from '../openai';
import { AnthropicParser } from '../anthropic';

describe('Detector Utilities', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = new ParserRegistry();
    registry.register('openai', new OpenAIParser());
    registry.register('anthropic', new AnthropicParser());
  });

  describe('detectProviderByStructure', () => {
    it('should detect OpenAI format by structure', () => {
      const data = {
        mapping: {
          'node-1': {
            message: { content: { parts: ['Hello'] } },
            parent: null,
            children: [],
          },
        },
        title: 'Test Conversation',
      };

      const provider = detectProviderByStructure(data);
      expect(provider).toBe('openai');
    });

    it('should detect Anthropic format by structure', () => {
      const data = {
        uuid: 'test-uuid',
        chat_messages: [
          { text: 'Hello', sender: 'human' },
        ],
        name: 'Test Conversation',
      };

      const provider = detectProviderByStructure(data);
      expect(provider).toBe('anthropic');
    });

    it('should return undefined for unknown format', () => {
      const data = {
        unknown_field: 'value',
      };

      const provider = detectProviderByStructure(data);
      expect(provider).toBeUndefined();
    });

    it('should return undefined for non-object data', () => {
      expect(detectProviderByStructure(null)).toBeUndefined();
      expect(detectProviderByStructure('string')).toBeUndefined();
      expect(detectProviderByStructure(123)).toBeUndefined();
    });
  });

  describe('detectWithConfidence', () => {
    it('should detect with high confidence when structural and parser match', () => {
      const data = {
        mapping: {
          'node-1': {
            message: { content: { parts: ['Hello'] } },
            parent: null,
            children: [],
          },
        },
      };

      const result = detectWithConfidence(data, registry);
      expect(result).toBeDefined();
      expect(result?.parser.provider).toBe('openai');
      expect(result?.confidence).toBe('high');
      expect(result?.matchedPatterns).toContain('structural:openai');
      expect(result?.matchedPatterns).toContain('parser:openai');
    });

    it('should detect with medium confidence when structural pattern partially matches', () => {
      const data = {
        mapping: {},
      };

      const result = detectWithConfidence(data, registry);
      expect(result).toBeDefined();
      expect(result?.parser.provider).toBe('openai');
      // This will be high confidence since both structural and parser match
      expect(result?.confidence).toBe('high');
    });

    it('should return undefined when no parser matches', () => {
      const data = {
        unknown_field: 'value',
      };

      const result = detectWithConfidence(data, registry);
      expect(result).toBeUndefined();
    });
  });

  describe('autoDetectParser', () => {
    it('should detect OpenAI parser', () => {
      const data = {
        mapping: {},
      };

      const parser = autoDetectParser(data, registry);
      expect(parser).toBeDefined();
      expect(parser?.provider).toBe('openai');
    });

    it('should detect Anthropic parser', () => {
      const data = {
        uuid: 'test',
        chat_messages: [],
      };

      const parser = autoDetectParser(data, registry);
      expect(parser).toBeDefined();
      expect(parser?.provider).toBe('anthropic');
    });

    it('should return undefined for unknown format', () => {
      const data = {
        unknown: 'format',
      };

      const parser = autoDetectParser(data, registry);
      expect(parser).toBeUndefined();
    });
  });

  describe('validateAndParseJSON', () => {
    it('should parse valid JSON string', () => {
      const json = '{"key": "value"}';
      const result = validateAndParseJSON(json);
      expect(result).toEqual({ key: 'value' });
    });

    it('should parse valid JSON buffer', () => {
      const json = Buffer.from('{"key": "value"}');
      const result = validateAndParseJSON(json);
      expect(result).toEqual({ key: 'value' });
    });

    it('should return undefined for invalid JSON', () => {
      const invalid = 'not json';
      const result = validateAndParseJSON(invalid);
      expect(result).toBeUndefined();
    });
  });

  describe('detectFromFile', () => {
    it('should detect provider from file content', () => {
      const fileContent = JSON.stringify({
        mapping: {},
      });

      const result = detectFromFile(fileContent, registry);
      expect(result).toBeDefined();
      expect(result?.parser.provider).toBe('openai');
    });

    it('should return undefined for invalid JSON', () => {
      const fileContent = 'invalid json';
      const result = detectFromFile(fileContent, registry);
      expect(result).toBeUndefined();
    });

    it('should work with Buffer input', () => {
      const fileContent = Buffer.from(JSON.stringify({
        uuid: 'test',
        chat_messages: [],
      }));

      const result = detectFromFile(fileContent, registry);
      expect(result).toBeDefined();
      expect(result?.parser.provider).toBe('anthropic');
    });
  });

  describe('getDetectionFailureReason', () => {
    it('should describe null/undefined data', () => {
      expect(getDetectionFailureReason(null)).toContain('null or undefined');
      expect(getDetectionFailureReason(undefined)).toContain('null or undefined');
    });

    it('should describe non-object data', () => {
      expect(getDetectionFailureReason('string')).toContain('not an object');
      expect(getDetectionFailureReason(123)).toContain('not an object');
    });

    it('should describe array data', () => {
      expect(getDetectionFailureReason([])).toContain('array');
    });

    it('should describe empty object', () => {
      expect(getDetectionFailureReason({})).toContain('empty object');
    });

    it('should describe missing fields for known patterns', () => {
      const data = { some_field: 'value' };
      const reason = getDetectionFailureReason(data);
      expect(reason).toContain('No matching provider pattern');
    });
  });
});
