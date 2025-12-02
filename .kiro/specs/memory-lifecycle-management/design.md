# Design Document

## Overview

The Memory Lifecycle Management system extends MemoryLayer's storage and context-engine components with time-based decay, importance scoring, archival, and cleanup mechanisms. This design integrates seamlessly with the existing `StorageClient` API and `ContextEngine` ranking system while introducing new lifecycle management capabilities.

The system operates through three main components:
1. **LifecycleManager**: Orchestrates lifecycle evaluation, state transitions, and background jobs
2. **DecayCalculator**: Computes time-based decay scores using configurable decay functions
3. **ImportanceScorer**: Calculates composite importance scores based on usage patterns

The design maintains backward compatibility with existing MemoryLayer APIs while adding optional lifecycle management features that can be enabled per workspace.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     MemoryLayer Core                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │   Storage    │◄────────┤   Context    │                  │
│  │   Client     │         │   Engine     │                  │
│  └──────┬───────┘         └──────────────┘                  │
│         │                                                     │
│         │ extends                                            │
│         ▼                                                     │
│  ┌──────────────────────────────────────────────┐           │
│  │      Lifecycle Management Layer              │           │
│  ├──────────────────────────────────────────────┤           │
│  │                                               │           │
│  │  ┌─────────────────┐                         │           │
│  │  │  Lifecycle      │                         │           │
│  │  │  Manager        │                         │           │
│  │  └────────┬────────┘                         │           │
│  │           │                                   │           │
│  │           ├──► DecayCalculator               │           │
│  │           ├──► ImportanceScorer              │           │
│  │           ├──► ArchivalService               │           │
│  │           ├──► CleanupService                │           │
│  │           └──► LifecycleEventLogger          │           │
│  │                                               │           │
│  └───────────────────────────────────────────────┘          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Memory Access Path**:
   ```
   User Query → ContextEngine.search()
              → StorageClient.searchMemories()
              → LifecycleManager.recordAccess()
              → Update last_accessed_at, access_count
              → Recalculate importance_score
              → Return results with decay-weighted scores
   ```

2. **Background Evaluation Path**:
   ```
   Scheduled Job → LifecycleManager.evaluateBatch()
                 → DecayCalculator.calculateDecayScores()
                 → Check TTL thresholds
                 → Transition states (active → decaying → archived)
                 → ArchivalService.archiveMemories()
                 → CleanupService.deleteExpired()
                 → LifecycleEventLogger.recordTransitions()
   ```

3. **Archival Restoration Path**:
   ```
   Access Archived Memory → StorageClient.getMemory(includeArchived=true)
                          → LifecycleManager.restoreFromArchive()
                          → Move to active storage
                          → Re-index embedding in Vectorize
                          → Update lifecycle_state = 'active'
                          → Return memory
   ```

## Components and Interfaces

### LifecycleManager

The main orchestrator for lifecycle operations.

```typescript
interface LifecycleConfig {
  enabled: boolean;
  defaultTTL: number; // milliseconds
  retentionPolicies: Map<MemoryType, RetentionPolicy>;
  decayFunction: DecayFunctionType;
  decayThreshold: number; // 0-1, threshold for entering decaying state
  importanceWeights: ImportanceWeights;
  evaluationInterval: number; // milliseconds between background jobs
  batchSize: number; // memories to process per batch
  archiveRetentionPeriod: number; // milliseconds before archived → expired
  auditRetentionPeriod: number; // milliseconds to keep lifecycle events
}

interface RetentionPolicy {
  ttl: number; // milliseconds
  importanceMultiplier: number; // extends TTL for high-importance memories
  gracePeriod: number; // milliseconds before accelerated decay for unused memories
}

interface ImportanceWeights {
  accessFrequency: number; // 0-1
  confidence: number; // 0-1
  relationshipCount: number; // 0-1
}

class LifecycleManager {
  constructor(
    private storageClient: StorageClient,
    private config: LifecycleConfig,
    private logger: Logger
  ) {}

  /**
   * Record a memory access and update importance score
   */
  async recordAccess(memoryId: string, workspaceId: string): Promise<Result<void, LifecycleError>>;

  /**
   * Evaluate lifecycle states for a batch of memories
   */
  async evaluateBatch(
    workspaceId: string,
    offset: number,
    limit: number
  ): Promise<Result<EvaluationResult, LifecycleError>>;

  /**
   * Pin a memory to prevent automatic lifecycle transitions
   */
  async pinMemory(
    memoryId: string,
    workspaceId: string,
    userId: string
  ): Promise<Result<void, LifecycleError>>;

  /**
   * Unpin a memory and resume lifecycle management
   */
  async unpinMemory(
    memoryId: string,
    workspaceId: string
  ): Promise<Result<void, LifecycleError>>;

  /**
   * Manually archive a memory
   */
  async archiveMemory(
    memoryId: string,
    workspaceId: string
  ): Promise<Result<void, LifecycleError>>;

  /**
   * Restore an archived memory to active state
   */
  async restoreMemory(
    memoryId: string,
    workspaceId: string
  ): Promise<Result<void, LifecycleError>>;

  /**
   * Get lifecycle metrics for a workspace
   */
  async getMetrics(workspaceId: string): Promise<Result<LifecycleMetrics, LifecycleError>>;

  /**
   * Start background evaluation jobs
   */
  startBackgroundJobs(): void;

  /**
   * Stop background evaluation jobs
   */
  stopBackgroundJobs(): void;
}
```

### DecayCalculator

Computes time-based decay scores using configurable functions.

```typescript
type DecayFunctionType = 'exponential' | 'linear' | 'step' | 'custom';

interface DecayFunction {
  type: DecayFunctionType;
  params: Record<string, number>;
  compute: (elapsedMs: number) => number; // returns 0-1
}

class DecayCalculator {
  constructor(private decayFunction: DecayFunction) {}

  /**
   * Calculate decay score based on time elapsed since last access
   */
  calculateDecayScore(lastAccessedAt: Date, now: Date = new Date()): number;

  /**
   * Get the decay function configuration
   */
  getDecayFunction(): DecayFunction;

  /**
   * Validate a custom decay function
   */
  static validateDecayFunction(fn: (elapsedMs: number) => number): boolean;
}

// Built-in decay functions
const DECAY_FUNCTIONS = {
  exponential: (lambda: number) => ({
    type: 'exponential' as const,
    params: { lambda },
    compute: (elapsedMs: number) => Math.exp(-lambda * elapsedMs / (1000 * 60 * 60 * 24)) // days
  }),

  linear: (decayPeriodMs: number) => ({
    type: 'linear' as const,
    params: { decayPeriodMs },
    compute: (elapsedMs: number) => Math.max(0, 1 - (elapsedMs / decayPeriodMs))
  }),

  step: (intervals: number[], scores: number[]) => ({
    type: 'step' as const,
    params: { intervals, scores },
    compute: (elapsedMs: number) => {
      for (let i = 0; i < intervals.length; i++) {
        if (elapsedMs < intervals[i]) return scores[i];
      }
      return scores[scores.length - 1];
    }
  })
};
```

### ImportanceScorer

Calculates composite importance scores based on usage patterns.

```typescript
interface AccessMetrics {
  access_count: number;
  last_accessed_at: Date;
  created_at: Date;
  relationship_count: number;
  confidence: number;
}

class ImportanceScorer {
  constructor(private weights: ImportanceWeights) {}

  /**
   * Calculate importance score from access metrics
   */
  calculateImportance(metrics: AccessMetrics): number;

  /**
   * Calculate access frequency (accesses per day)
   */
  private calculateAccessFrequency(metrics: AccessMetrics): number;

  /**
   * Normalize a value to 0-1 range using sigmoid
   */
  private normalize(value: number, midpoint: number, steepness: number): number;
}
```

### ArchivalService

Handles moving memories to/from cold storage.

```typescript
interface ArchivalOptions {
  batchSize: number;
  includeRelationships: boolean;
}

class ArchivalService {
  constructor(
    private storageClient: StorageClient,
    private logger: Logger
  ) {}

  /**
   * Archive a batch of memories
   */
  async archiveBatch(
    memoryIds: string[],
    workspaceId: string,
    options?: ArchivalOptions
  ): Promise<Result<ArchivalResult, LifecycleError>>;

  /**
   * Restore a memory from archive
   */
  async restore(
    memoryId: string,
    workspaceId: string
  ): Promise<Result<void, LifecycleError>>;

  /**
   * List archived memories with pagination
   */
  async listArchived(
    workspaceId: string,
    options: PaginationOptions
  ): Promise<Result<ArchivedMemory[], LifecycleError>>;
}
```

### CleanupService

Handles permanent deletion of expired memories.

```typescript
interface CleanupOptions {
  batchSize: number;
  dryRun: boolean;
}

interface CleanupResult {
  memoriesDeleted: number;
  relationshipsDeleted: number;
  storageReclaimed: number; // bytes
  executionTime: number; // milliseconds
  errors: CleanupError[];
}

class CleanupService {
  constructor(
    private storageClient: StorageClient,
    private logger: Logger
  ) {}

  /**
   * Delete expired memories permanently
   */
  async cleanupExpired(
    workspaceId: string,
    options?: CleanupOptions
  ): Promise<Result<CleanupResult, LifecycleError>>;

  /**
   * Delete lifecycle events older than audit retention period
   */
  async cleanupLifecycleEvents(
    workspaceId: string,
    retentionPeriodMs: number
  ): Promise<Result<number, LifecycleError>>;
}
```

### LifecycleEventLogger

Records lifecycle state transitions for auditability.

```typescript
interface LifecycleEvent {
  id: string;
  memory_id: string;
  workspace_id: string;
  previous_state: LifecycleState;
  new_state: LifecycleState;
  reason: string;
  triggered_by: 'system' | 'user';
  user_id?: string;
  metadata: Record<string, any>;
  created_at: Date;
}

type LifecycleState = 'active' | 'decaying' | 'archived' | 'expired' | 'pinned';

class LifecycleEventLogger {
  constructor(private storageClient: StorageClient) {}

  /**
   * Record a lifecycle state transition
   */
  async logTransition(event: Omit<LifecycleEvent, 'id' | 'created_at'>): Promise<Result<void, LifecycleError>>;

  /**
   * Get lifecycle history for a memory
   */
  async getHistory(
    memoryId: string,
    workspaceId: string
  ): Promise<Result<LifecycleEvent[], LifecycleError>>;

  /**
   * Get recent transitions for a workspace
   */
  async getRecentTransitions(
    workspaceId: string,
    limit: number
  ): Promise<Result<LifecycleEvent[], LifecycleError>>;
}
```

## Data Models

### Extended Memory Model

```typescript
interface Memory {
  // Existing fields
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  type: MemoryType;
  content: string;
  confidence: number;
  metadata: Record<string, any>;
  embedding?: number[];
  created_at: Date;
  updated_at: Date;

  // New lifecycle fields
  lifecycle_state: LifecycleState;
  last_accessed_at: Date;
  access_count: number;
  importance_score: number;
  decay_score: number;
  effective_ttl: number; // milliseconds
  pinned: boolean;
  pinned_by?: string; // user_id
  pinned_at?: Date;
  archived_at?: Date;
  expires_at?: Date;
}
```

### Database Schema Changes

```sql
-- Add lifecycle columns to memories table
ALTER TABLE memories ADD COLUMN lifecycle_state VARCHAR(20) DEFAULT 'active';
ALTER TABLE memories ADD COLUMN last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE memories ADD COLUMN access_count INTEGER DEFAULT 0;
ALTER TABLE memories ADD COLUMN importance_score REAL DEFAULT 0.5;
ALTER TABLE memories ADD COLUMN decay_score REAL DEFAULT 1.0;
ALTER TABLE memories ADD COLUMN effective_ttl BIGINT; -- milliseconds
ALTER TABLE memories ADD COLUMN pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE memories ADD COLUMN pinned_by VARCHAR(255);
ALTER TABLE memories ADD COLUMN pinned_at TIMESTAMP;
ALTER TABLE memories ADD COLUMN archived_at TIMESTAMP;
ALTER TABLE memories ADD COLUMN expires_at TIMESTAMP;

-- Create indexes for lifecycle queries
CREATE INDEX idx_memories_lifecycle_state ON memories(workspace_id, lifecycle_state);
CREATE INDEX idx_memories_last_accessed ON memories(workspace_id, last_accessed_at);
CREATE INDEX idx_memories_expires_at ON memories(workspace_id, expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_memories_pinned ON memories(workspace_id, pinned) WHERE pinned = TRUE;

-- Create archived_memories table for cold storage
CREATE TABLE archived_memories (
  id VARCHAR(255) PRIMARY KEY,
  workspace_id VARCHAR(255) NOT NULL,
  conversation_id VARCHAR(255),
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  last_accessed_at TIMESTAMP NOT NULL,
  access_count INTEGER NOT NULL,
  importance_score REAL NOT NULL,
  archived_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  -- No embedding stored in archive (removed from vector index)
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_archived_memories_workspace ON archived_memories(workspace_id);
CREATE INDEX idx_archived_memories_expires_at ON archived_memories(workspace_id, expires_at);

-- Create lifecycle_events table for audit trail
CREATE TABLE lifecycle_events (
  id VARCHAR(255) PRIMARY KEY,
  memory_id VARCHAR(255) NOT NULL,
  workspace_id VARCHAR(255) NOT NULL,
  previous_state VARCHAR(20) NOT NULL,
  new_state VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  triggered_by VARCHAR(10) NOT NULL, -- 'system' or 'user'
  user_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_lifecycle_events_memory ON lifecycle_events(memory_id);
CREATE INDEX idx_lifecycle_events_workspace ON lifecycle_events(workspace_id, created_at DESC);
CREATE INDEX idx_lifecycle_events_created_at ON lifecycle_events(created_at);
```

## Integration with Existing Components

### StorageClient Extensions

```typescript
interface StorageClient {
  // Existing methods...

  // New lifecycle methods
  updateMemoryLifecycle(
    memoryId: string,
    workspaceId: string,
    updates: LifecycleUpdates
  ): Promise<Result<void, StorageError>>;

  getMemoriesByLifecycleState(
    workspaceId: string,
    state: LifecycleState,
    options?: PaginationOptions
  ): Promise<Result<Memory[], StorageError>>;

  searchMemories(
    workspaceId: string,
    query: SearchQuery & { includeArchived?: boolean }
  ): Promise<Result<SearchResult[], StorageError>>;
}
```

### ContextEngine Integration

The ContextEngine's ranking system will be extended to incorporate decay scores:

```typescript
// In MemoryRanker.defaultRanking()
function calculateFinalScore(result: SearchResult, options: RankingOptions): number {
  const similarityScore = result.score;
  const recencyScore = calculateRecencyScore(result.memory.last_accessed_at);
  const confidenceScore = result.memory.confidence;
  const decayScore = result.memory.decay_score; // NEW

  return (
    similarityScore * options.similarityWeight +
    recencyScore * options.recencyWeight +
    confidenceScore * options.confidenceWeight
  ) * decayScore; // Multiply by decay to down-weight stale memories
}
```

## Error Handling

```typescript
type LifecycleErrorType =
  | 'invalid_state_transition'
  | 'memory_not_found'
  | 'memory_pinned'
  | 'archival_failed'
  | 'restoration_failed'
  | 'cleanup_failed'
  | 'invalid_config'
  | 'storage_error';

interface LifecycleError {
  type: LifecycleErrorType;
  message: string;
  memoryId?: string;
  cause?: unknown;
}
```

## Testing Strategy

### Unit Tests

- DecayCalculator: Test all decay functions (exponential, linear, step, custom)
- ImportanceScorer: Test importance calculation with various access patterns
- State machine: Test all valid and invalid state transitions
- Batch processing: Test batch evaluation with various batch sizes

### Property-Based Tests

Property-based tests will validate the correctness properties defined in requirements:

#### Property 1: Decay score bounds
*For any* memory and elapsed time, the decay score must be between 0 and 1 inclusive
**Validates: Requirements - Invariants**

#### Property 2: Pinned memories immunity
*For any* pinned memory, lifecycle evaluation must not change its state to decaying, archived, or expired
**Validates: Requirements 8.2**

#### Property 3: State transition validity
*For any* memory state transition, the transition must be in the set of valid transitions defined in the state machine
**Validates: Requirements - Lifecycle State Machine**

#### Property 4: Archival preservation
*For any* memory, archiving then restoring must preserve all metadata fields and relationship references
**Validates: Requirements 3.3**

#### Property 5: Decay determinism
*For any* memory with fixed last_accessed_at and evaluation timestamp, calculating decay score multiple times must return the same value
**Validates: Requirements - Round Trip Properties**

#### Property 6: Idempotent evaluation
*For any* batch of memories, running lifecycle evaluation twice without time progression must produce identical state transitions
**Validates: Requirements - Idempotence**

#### Property 7: Importance monotonicity
*For any* memory, accessing it must result in importance_score greater than or equal to the previous importance_score
**Validates: Requirements 4.1, Metamorphic Properties**

#### Property 8: Decay monotonicity
*For any* two memories with identical last_accessed_at, the one evaluated at a later timestamp must have decay_score less than or equal to the other
**Validates: Requirements - Metamorphic Properties**

#### Property 9: TTL extension
*For any* memory with high importance score, the effective_ttl must be greater than or equal to the base TTL for its memory type
**Validates: Requirements 4.3**

#### Property 10: Cleanup safety
*For any* batch of expired memories, running cleanup must delete only memories in expired state and must not affect active, decaying, or archived memories
**Validates: Requirements 5.2**

#### Property 11: Invalid config rejection
*For any* decay function configuration with invalid parameters (e.g., returns values outside 0-1), initialization must fail with invalid_config error
**Validates: Requirements - Error Conditions**

#### Property 12: Batch processing resilience
*For any* batch containing some memories that fail processing, the batch operation must continue and successfully process remaining valid memories
**Validates: Requirements 7.4, Error Conditions**

### Integration Tests

- End-to-end lifecycle: Create memory → access → decay → archive → restore → cleanup
- Background jobs: Verify scheduled evaluation runs and processes memories correctly
- Storage integration: Test with both SQLite and Postgres backends
- Vector index sync: Verify embeddings are removed/restored during archival/restoration

### Performance Tests

- Batch evaluation: Process 10,000 memories in under 5 seconds
- Decay calculation: Calculate decay for 1,000 memories in under 100ms
- Archival: Archive 1,000 memories in under 10 seconds
- Cleanup: Delete 1,000 expired memories in under 5 seconds

## Configuration Examples

### Basic Configuration

```typescript
const lifecycleConfig: LifecycleConfig = {
  enabled: true,
  defaultTTL: 90 * 24 * 60 * 60 * 1000, // 90 days
  retentionPolicies: new Map([
    ['entity', { ttl: 180 * 24 * 60 * 60 * 1000, importanceMultiplier: 2.0, gracePeriod: 7 * 24 * 60 * 60 * 1000 }],
    ['fact', { ttl: 90 * 24 * 60 * 60 * 1000, importanceMultiplier: 1.5, gracePeriod: 7 * 24 * 60 * 60 * 1000 }],
    ['decision', { ttl: 365 * 24 * 60 * 60 * 1000, importanceMultiplier: 3.0, gracePeriod: 30 * 24 * 60 * 60 * 1000 }],
  ]),
  decayFunction: 'exponential',
  decayThreshold: 0.3,
  importanceWeights: {
    accessFrequency: 0.5,
    confidence: 0.3,
    relationshipCount: 0.2,
  },
  evaluationInterval: 60 * 60 * 1000, // 1 hour
  batchSize: 1000,
  archiveRetentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
  auditRetentionPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
};

const lifecycleManager = new LifecycleManager(storageClient, lifecycleConfig, logger);
lifecycleManager.startBackgroundJobs();
```

### Custom Decay Function

```typescript
const customDecay: DecayFunction = {
  type: 'custom',
  params: { halfLife: 30 * 24 * 60 * 60 * 1000 }, // 30 days
  compute: (elapsedMs: number) => {
    const halfLife = 30 * 24 * 60 * 60 * 1000;
    return Math.pow(0.5, elapsedMs / halfLife);
  }
};

// Validate before use
if (DecayCalculator.validateDecayFunction(customDecay.compute)) {
  lifecycleConfig.decayFunction = customDecay;
}
```

## Migration Strategy

### Phase 1: Schema Migration
1. Add lifecycle columns to existing memories table
2. Initialize default values: lifecycle_state='active', decay_score=1.0, importance_score=0.5
3. Set last_accessed_at = created_at for existing memories
4. Create archived_memories and lifecycle_events tables

### Phase 2: Gradual Rollout
1. Deploy lifecycle management with `enabled: false` by default
2. Enable for test workspaces
3. Monitor performance and adjust batch sizes
4. Enable globally with conservative TTL values

### Phase 3: Optimization
1. Analyze access patterns and adjust decay functions
2. Tune importance weights based on usage data
3. Optimize batch processing based on memory volume
4. Add indexes based on query patterns

## Performance Considerations

### Indexing Strategy
- Composite index on (workspace_id, lifecycle_state) for state-based queries
- Index on last_accessed_at for decay calculations
- Partial index on pinned memories for fast exclusion
- Index on expires_at for cleanup queries

### Batch Processing
- Process memories in batches of 1000 to avoid memory pressure
- Use database cursors for large result sets
- Parallelize independent operations (decay calculation, importance scoring)
- Rate limit archival operations to avoid overwhelming vector store

### Caching
- Cache decay function results for common elapsed times
- Cache importance scores for recently accessed memories
- Cache lifecycle configuration to avoid repeated database reads

### Background Job Scheduling
- Stagger evaluation jobs across workspaces to distribute load
- Run cleanup during off-peak hours
- Use exponential backoff for failed operations
- Implement circuit breakers for external dependencies (vector store)

## Monitoring and Observability

### Metrics to Track
- Memories per lifecycle state (gauge)
- State transitions per hour (counter)
- Average decay score per workspace (gauge)
- Average importance score per memory type (gauge)
- Archival rate (memories/hour)
- Cleanup rate (memories/hour)
- Storage usage (active vs archived)
- Background job execution time (histogram)
- Failed operations (counter)

### Logging
- Log all state transitions with memory ID and reason
- Log batch processing statistics (processed, failed, duration)
- Log archival and restoration operations
- Log cleanup operations with deletion counts
- Log configuration changes

### Alerts
- Alert when cleanup fails repeatedly
- Alert when archive size exceeds threshold
- Alert when background jobs fall behind schedule
- Alert when state transition failures exceed threshold
