# Getting Started with MemoryLayer

Build an AI app with persistent memory in under 5 minutes.

## Installation

```bash
npm install @memorylayer/core
```

## Quick Start (60 Seconds)

### 1. Create a MemoryLayer Instance

```typescript
import { MemoryLayer } from '@memorylayer/core';

const ml = new MemoryLayer({ 
  storage: 'sqlite://memory.db',
  apiKey: process.env.OPENAI_API_KEY 
});
```

### 2. Extract Memories

```typescript
await ml.extract("Project Alpha deadline is Q4 2024");
await ml.extract("We chose PostgreSQL for the database");
await ml.extract("John is the tech lead");
```

### 3. Search with Natural Language

```typescript
const results = await ml.search("when is the deadline?");
// Returns: "Project Alpha deadline is Q4 2024"
```

### 4. Build Context for AI

```typescript
const context = await ml.buildContext("summarize Project Alpha");
// Returns: Full context about the project
```

That's it! You now have a memory-powered AI app.

## Choose Your Configuration

MemoryLayer is modular. Pick what fits your needs:

### Local Development (SQLite)

Perfect for prototyping and testing.

```typescript
const ml = new MemoryLayer({
  storage: 'sqlite://memory.db',
  apiKey: process.env.OPENAI_API_KEY
});
```

**Pros**: Fast, simple, no setup
**Cons**: Single-machine only

### Production (Postgres + Vectorize)

Scale to millions of memories.

```typescript
const ml = new MemoryLayer({
  storage: {
    postgres: {
      url: process.env.SUPABASE_URL,
      apiKey: process.env.SUPABASE_KEY
    },
    vectorize: {
      mode: 'cloudflare',
      accountId: process.env.CF_ACCOUNT_ID,
      apiToken: process.env.CF_API_TOKEN,
      indexName: 'memories'
    }
  },
  apiKey: process.env.OPENAI_API_KEY
});
```

**Pros**: Scalable, cloud-native, team-ready
**Cons**: Requires cloud services

## See It In Action

### Ghost (Blog CMS)
See how Ghost uses MemoryLayer to semantically link blog posts:
- **Memory Types**: `['topic', 'reference', 'entity']`
- **Storage**: SQLite (local)
- **Use Case**: Content discovery, related posts

[See example →](../packages/core/examples/blog-cms.ts)

### Handoff (Conversation Manager)
See how Handoff uses MemoryLayer to extract knowledge from team chats:
- **Memory Types**: `['entity', 'fact', 'decision', 'task']`
- **Storage**: Postgres + Vectorize (production)
- **Use Case**: AI-powered briefs, knowledge extraction

[See example →](../packages/core/examples/conversation-manager.ts)

## Next Steps

### Customize Memory Types

Want to extract custom information? Define your own types:

```typescript
const ml = new MemoryLayer({
  storage: 'sqlite://memory.db',
  apiKey: process.env.OPENAI_API_KEY,
  memoryTypes: ['bug', 'feature', 'requirement']
});
```

### Advanced: Use Modular Packages

Need more control? Import the packages directly:

```typescript
import { StorageClient } from '@memorylayer/storage';
import { MemoryExtractor } from '@memorylayer/memory-extraction';
import { ContextEngine } from '@memorylayer/context-engine';

const storage = new StorageClient({ /* ... */ });
const extractor = new MemoryExtractor({ /* ... */ });
const context = new ContextEngine({ /* ... */ });
```

### Learn the Architecture

Understand the modular design:
- [Architecture Overview](./ARCHITECTURE.md)
- [Storage Layer](../packages/core/storage/README.md)
- [Extraction Engine](../packages/core/memory-extraction/README.md)
- [Context Engine](../packages/core/context-engine/README.md)

## Troubleshooting

### "API key required for extraction"
Make sure to provide your OpenAI API key:
```typescript
apiKey: process.env.OPENAI_API_KEY
```

### "Storage must be initialized"
Check that your storage URL is correct:
- SQLite: `'sqlite://path/to/db.db'`
- Postgres: Use full config object

### Need Help?
- Check the [examples](../packages/core/examples/)
- Review the [architecture docs](./ARCHITECTURE.md)
- Look at Ghost and Handoff implementations

## What's Next?

- **Deploy to production**: Switch from SQLite to Postgres
- **Customize extraction**: Define your own memory types
- **Optimize search**: Tune confidence thresholds and ranking
- **Scale up**: Add caching, batch operations, real-time subscriptions
