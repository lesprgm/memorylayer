import { describe, it, expect } from 'vitest';
import { LLMCoordinator } from '../src/services/llm-coordinator.js';
import type { MemoryReference } from '../src/types.js';

describe('LLMCoordinator summarize fallback', () => {
  it('emits an info.summarize action with sources when asked to summarize', async () => {
    const llm = new LLMCoordinator();
    const memories: MemoryReference[] = [
      {
        id: 'mem-1',
        type: 'entity.file',
        score: 0.9,
        summary: 'Design_Doc_v3.pdf (modified 2024-03-10) @ /tmp/design_v3.pdf',
        metadata: { modified: '2024-03-10T12:00:00Z', path: '/tmp/design_v3.pdf' },
      },
      {
        id: 'mem-2',
        type: 'fact.decision',
        score: 0.8,
        summary: 'Chose REST with versioning on March 10th',
        metadata: { timestamp: '2024-03-10T09:00:00Z' },
      },
    ];

    const response = await llm.generateResponse('summarize the API redesign', '', memories);

    expect(response.actions[0]?.type).toBe('info.summarize');
    const params = response.actions[0]?.params as any;
    expect(params.topic.toLowerCase()).toContain('api redesign');
    expect(params.sources).toEqual(expect.arrayContaining(['mem-1', 'mem-2']));
    expect(['brief', 'detailed', 'timeline']).toContain(params.format);
    expect(response.assistant_text.toLowerCase()).toContain('summary');
  });
});
