# MemoryLayer - Memory Extraction Package

Core package for extracting, chunking, and deduplicating memories from conversations with built-in MAKER reliability layer.

## Features

- **Conversation-to-Memory Extraction**: Extract structured memories from conversations
- **Chunking Strategies**: Split large conversations into manageable chunks
- **Deduplication**: Identify and merge similar memories
- **Custom Memory Types**: Define application-specific memory schemas
- **MAKER Reliability Layer**: Multi-agent consensus for robust memory extraction (NEW)

## Installation

```bash
npm install @memorylayer/memory-extraction
```

const extractor = new MemoryExtractor({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  strategy: new StructuredOutputStrategy(),
  memoryTypes: ['entity', 'fact', 'decision'],
  minConfidence: 0.6
});

// Extract memories from a conversation
const result = await extractor.extract(conversation, workspaceId);

if (result.ok) {
  const { memories, relationships } = result.value;
  // Process extracted memories
}
```

### Custom Memory Types

You can register custom memory types to extract domain-specific information:

```typescript
import { MemoryTypeConfig } from '@memorylayer/memory-extraction';

// Define a custom "task" memory type
const taskConfig: MemoryTypeConfig = {
  type: 'task',
  extractionPrompt: 'Extract action items and tasks from the conversation',
  schema: {
    type: 'object',
    properties: {
      task: { type: 'string' },
      assignee: { type: 'string' },
      dueDate: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] }
    },
    required: ['task']
  },
  validator: (memory) => {
    // Optional custom validation
    return memory.metadata.task && memory.metadata.task.length > 5;
  }
};

// Register the custom type
extractor.registerMemoryType('task', taskConfig);

// Now extract with the custom type included
const result = await extractor.extract(conversation, workspaceId, {
  memoryTypes: ['entity', 'fact', 'task']
});
```

#### Custom Memory Type Configuration

A `MemoryTypeConfig` has the following properties:

- **type** (required): The name of the memory type
- **extractionPrompt** (required): Instructions for the LLM on how to extract this type
- **schema** (optional): JSON schema defining the expected metadata structure
- **validator** (optional): Custom validation function for additional checks

See `examples/custom-memory-types.ts` for more detailed examples.

### Conversation Chunking

For large conversations that exceed LLM context windows, enable automatic chunking:

```typescript
const extractor = new MemoryExtractor({
  provider: new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gemini-flash-latest',
  }),
  strategy: new StructuredOutputStrategy(),
  
  // Enable chunking for large conversations
  chunking: {
    enabled: true,
    maxTokensPerChunk: 100000,      // Maximum tokens per chunk
    strategy: 'sliding-window',      // Chunking strategy
    overlapPercentage: 0.1,          // 10% overlap between chunks
    failureMode: 'continue-on-error', // Continue if a chunk fails
  },
});

// Extract from large conversation - chunking happens automatically
const result = await extractor.extract(largeConversation, workspaceId);

if (result.ok && result.value.chunkingMetadata) {
  console.log(`Processed ${result.value.chunkingMetadata.totalChunks} chunks`);
  console.log(`Total tokens: ${result.value.chunkingMetadata.totalTokens}`);
}
```

**Chunking strategies:**
- `sliding-window`: Fixed-size overlapping windows (default, most reliable)
- `conversation-boundary`: Split at natural conversation breaks
- `semantic`: Split based on topic changes

See [CHUNKING.md](./CHUNKING.md) for complete documentation, [TOKEN_COUNTING.md](./TOKEN_COUNTING.md) for token counting accuracy details, and [MIGRATION.md](./MIGRATION.md) for enabling chunking in existing applications.

## MAKER Reliability Layer

**NEW**: MAKER (Multi-Agent Knowledge Extraction & Refinement) is a reliability layer that enhances memory extraction through parallel microagents, validation, and consensus voting.

### Quick Start

```typescript
import { makerReliableExtractMemory } from '@memorylayer/memory-extraction';

const extracted = await makerReliableExtractMemory(conversationText, llmProvider);

if (extracted) {
  console.log('Summary:', extracted.summary);
  console.log('Decisions:', extracted.decisions);
  console.log('Todos:', extracted.todos);
}
```

### How MAKER Works

1. **Microagents**: Launches 3 parallel LLM calls with identical prompts
2. **Red-Flagging**: Validates each response (schema checks, content quality)
3. **Voting**: Selects consensus result based on decision/todo overlap
4. **Fallback**: Returns `null` if all agents fail or all outputs are invalid

**Benefits**:
- Improved reliability through redundancy
- Error correction via consensus voting  
- Graceful degradation on failures
- Minimal latency overhead (parallel execution)

**Cost**: ~3× LLM calls using Gemini 2.0 Flash Lite

### Configuration

```bash
# Environment variables
MAKER_ENABLED=true              # Enable/disable (default: true)
MAKER_REPLICAS=3                # Parallel microagents (default: 3)
MAKER_VOTE_K=2                  # Voting threshold (default: 2)
MAKER_TEMPERATURE=0.4           # LLM temperature (default: 0.4)
MAKER_TIMEOUT=10000             # Timeout in ms (default: 10000)
MAKER_MODEL=gemini-flash-lite-latest # Model (default: Gemini Flash Lite Latest)
```

Or programmatically:

```typescript
import { makerConfig } from '@memorylayer/memory-extraction';

console.log('MAKER enabled:', makerConfig.enabled);
console.log('Replicas:', makerConfig.replicas);
```

### Memory Structure

```typescript
interface ExtractedMemory {
  summary: string;      // Session summary (20-1500 chars)
  decisions: string[];  // Decision points made
  todos: string[];      // Action items identified
}
```

### Performance

Based on stress testing (mocked providers):

- **Latency**: p50 < 100ms, p95 < 200ms, p99 < 300ms
- **Concurrency**: 50+ parallel extractions supported
- **Stability**: 0% degradation over 100+ sequential extractions
- **Resilience**: Graceful handling of 50-100% failure rates

*Note: Real Gemini API latency ~500-2000ms due to network overhead*

### Testing

```bash
# MAKER-specific tests
npm test src/__tests__/maker.test.ts              # Unit tests (22)
npm test src/__tests__/maker-integration.test.ts  # Integration (7)
npm test src/__tests__/maker-stress.test.ts       # Stress tests (15)
```

**Total MAKER Coverage**: 44 tests (all passing)

## Development

```bash
# Build
npm run build

# Test
npm test

# Test in watch mode
npm run test:watch
```

## Development Approach

This package was developed using Kiro's spec-driven development methodology:

### Spec-Driven Development with Kiro

Two separate Kiro specs guided development:

1. **`.kiro/specs/core-memory-extraction/`** - Core extraction framework
   - **requirements.md** - Memory extraction strategies, provider abstraction, deduplication
   - **design.md** - `MemoryExtractor` architecture, extraction strategies, provider interfaces
   - **tasks.md** - Implementation breakdown

2. **`.kiro/specs/conversation-chunking/`** - Chunking system
   - **requirements.md** - Requirements for handling 200K+ token conversations
   - **design.md** - Chunking strategies, token counting, error handling
   - **tasks.md** - Chunking implementation tasks

### Key Spec-Driven Decisions

1. **Provider-Agnostic Architecture**: Abstract provider interface enabling OpenAI, Anthropic, Gemini
2. **Pluggable Strategies**: Extraction strategies (prompt-based, structured output, function-calling)
3. **Conversation Chunking**: Sliding-window chunking with configurable overlap and token budgets
4. **Deduplication**: Deterministic IDs for memory merging and updates over time
5. **MAKER Reliability Layer**: Post-spec enhancement for multi-agent consensus extraction

### Development Process

1. **Spec Creation**: Defined extraction pipeline, memory type system, and chunking architecture
2. **AI-Assisted Implementation**: ~80% of initial implementation generated from specs using Kiro
   - Core extraction logic and strategy patterns
   - Provider adapters and interfaces
   - Chunking implementation with token counting
3. **Manual Refinement**: 
   - MAKER reliability layer (51 tests)
   - Comprehensive chunking tests
   - Custom memory type registration system
   - Production optimizations and error handling

The dual-spec approach enabled parallel development of core extraction and chunking features, then integrated them seamlessly.

## License

MIT
