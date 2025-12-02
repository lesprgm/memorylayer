# Requirements Document

## Introduction

This specification defines a Memory Lifecycle Management system for MemoryLayer that handles memory aging, decay, archival, and cleanup. Currently, memories persist indefinitely without any mechanism to handle staleness, relevance decay, or storage optimization. This leads to database bloat, degraded query performance, and irrelevant historical context polluting search results.

The Memory Lifecycle Management system will introduce time-based decay, importance scoring, archival strategies, and automatic cleanup mechanisms to keep the memory store relevant, performant, and storage-efficient.

## Glossary

- **Memory**: A structured piece of extracted information (entity, fact, decision) stored in the MemoryLayer system
- **Lifecycle State**: The current status of a memory (active, decaying, archived, expired, pinned)
- **Decay Score**: A time-based relevance score that decreases based on time elapsed since last access
- **Importance Score**: A composite score based on usage frequency, confidence, and relationships
- **Archival**: The process of moving inactive memories to cold storage while maintaining retrievability
- **Cold Storage**: A separate storage tier (table, schema, or object store) for archived memories
- **TTL (Time To Live)**: The duration a memory remains in active state before transitioning to archived
- **Effective TTL**: The actual TTL after applying importance score multipliers
- **Retention Policy**: Rules defining how long memories persist in each lifecycle state
- **Access Pattern**: Historical record of when and how frequently a memory is retrieved
- **Storage Client**: The MemoryLayer storage abstraction layer (SQLite, Postgres, Vectorize)
- **Context Engine**: The MemoryLayer component responsible for semantic search and context building

## Lifecycle State Machine

The system SHALL enforce the following lifecycle state transitions:

- **Valid Transitions**:
  - `active → decaying` (when decay score falls below threshold)
  - `decaying → archived` (when TTL expires without access)
  - `active → archived` (when TTL expires without entering decaying state)
  - `archived → active` (when an archived memory is accessed)
  - `archived → expired` (when retention period expires)
  - `expired → deleted` (permanent removal)
  - `any state → pinned` (manual override)
  - `pinned → previous state` (when unpinned)

- **Invalid Transitions**: All other state transitions are prohibited and SHALL be rejected

- **Pinned Override**: Pinned memories SHALL skip all automatic lifecycle transitions (decay, archival, expiration) regardless of age, access patterns, or TTL

## Precedence Rules

When multiple lifecycle rules apply, the system SHALL evaluate them in the following priority order:

1. **Pinned Status** (highest priority): Pinned memories are exempt from all automatic lifecycle management
2. **Importance Score**: High importance extends effective TTL by a configurable multiplier
3. **TTL/Retention**: Memories exceeding effective TTL transition to archived state
4. **Decay Score**: Memories with decay score below threshold transition to decaying state (visual indicator, still in active storage)

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want memories to automatically decay over time, so that recent information is prioritized over stale historical data.

#### Acceptance Criteria

1. WHEN a memory is created THEN the system SHALL assign an initial decay score of 1.0 and record the creation timestamp
2. WHEN calculating decay score THEN the system SHALL apply an exponential decay function based on time elapsed since last access
3. WHEN a memory is accessed THEN the system SHALL update the last_accessed_at timestamp and reset the decay calculation
4. WHEN searching memories THEN the system SHALL multiply the similarity score by the decay score to prioritize recent memories
5. WHEN a memory's decay score falls below a configurable threshold THEN the system SHALL transition the memory to decaying state

### Requirement 2

**User Story:** As a developer, I want to configure retention policies per memory type, so that critical information persists longer than ephemeral data.

#### Acceptance Criteria

1. WHEN configuring the system THEN the administrator SHALL specify TTL values per memory type (entity, fact, decision, custom)
2. WHEN a memory exceeds its effective TTL without access THEN the system SHALL transition the memory to archived state
3. WHEN a retention policy is updated THEN the system SHALL apply the new policy to existing memories during the next lifecycle evaluation
4. WHEN a memory type has no explicit policy THEN the system SHALL apply a default retention policy of 90 days
5. WHERE a memory is marked as pinned THEN the system SHALL exempt the memory from all automatic lifecycle transitions as defined in Requirement 8

### Requirement 3

**User Story:** As a system operator, I want automatic archival of inactive memories, so that active storage remains performant and cost-effective.

#### Acceptance Criteria

1. WHEN a memory enters archived state THEN the system SHALL move the memory to cold storage and remove it from active vector indexes
2. WHEN an archived memory is accessed THEN the system SHALL restore the memory to active state and re-index its embedding
3. WHEN archiving memories THEN the system SHALL maintain all metadata and relationships for future restoration
4. WHEN listing archived memories THEN the system SHALL provide a separate API endpoint with pagination support
5. WHEN searching memories THEN the system MAY optionally include archived memories via an includeArchived flag using a separate retrieval path
6. WHEN the archive size exceeds a configurable threshold THEN the system SHALL log a warning for administrator review

### Requirement 4

**User Story:** As a developer, I want importance scoring based on usage patterns, so that frequently accessed memories persist longer than rarely used ones.

#### Acceptance Criteria

1. WHEN a memory is accessed THEN the system SHALL increment an access counter, update the access frequency metric, and recalculate importance score
2. WHEN calculating importance score THEN the system SHALL combine access frequency, confidence score, and relationship count using weighted factors
3. WHEN a memory has high importance score THEN the system SHALL extend its effective TTL by a configurable multiplier
4. WHEN a memory has zero accesses after initial creation THEN the system SHALL apply accelerated decay after a grace period
5. WHEN importance scores are recalculated in batch THEN the system SHALL process memories in batches to avoid performance degradation
6. WHEN background jobs run THEN the system SHALL recalculate importance scores for long-lived memories that have not been recently accessed

### Requirement 5

**User Story:** As a system administrator, I want automatic cleanup of expired memories, so that storage does not grow unbounded.

#### Acceptance Criteria

1. WHEN a memory has been archived for longer than the retention period THEN the system SHALL mark the memory as expired
2. WHEN a memory is marked as expired THEN the system SHALL permanently delete the memory and all associated relationships
3. WHEN running cleanup operations THEN the system SHALL process deletions in batches with configurable batch size
4. WHEN cleanup completes THEN the system SHALL log statistics including memories deleted, storage reclaimed, and execution time
5. IF cleanup fails for a batch THEN the system SHALL log the error and continue processing remaining batches

### Requirement 6

**User Story:** As a developer, I want lifecycle state transitions to be auditable, so that I can debug issues and understand memory evolution.

#### Acceptance Criteria

1. WHEN a memory transitions between lifecycle states THEN the system SHALL record the transition in a lifecycle_events table
2. WHEN recording a transition THEN the system SHALL capture the previous state, new state, reason, and timestamp
3. WHEN querying lifecycle history THEN the system SHALL provide an API to retrieve all transitions for a given memory
4. WHEN a memory is deleted THEN the system SHALL retain lifecycle events for a configurable audit period
5. WHEN lifecycle events exceed the audit retention period THEN the system SHALL archive or delete the events based on configuration

### Requirement 7

**User Story:** As a system operator, I want scheduled background jobs to manage lifecycle transitions, so that the system maintains itself without manual intervention.

#### Acceptance Criteria

1. WHEN the lifecycle manager starts THEN the system SHALL schedule periodic evaluation jobs at configurable intervals
2. WHEN an evaluation job runs THEN the system SHALL process memories in batches to calculate decay scores and check TTL thresholds
3. WHEN processing a batch THEN the system SHALL update lifecycle states and trigger archival or cleanup as needed
4. WHEN a job encounters errors THEN the system SHALL log the error, skip the problematic memory, and continue processing
5. WHEN a job completes THEN the system SHALL record execution metrics including duration, memories processed, and state transitions

### Requirement 8

**User Story:** As a developer, I want to manually pin important memories, so that critical information is never archived or deleted.

#### Acceptance Criteria

1. WHEN a memory is pinned THEN the system SHALL set a pinned flag, record the user who pinned it, and record the timestamp
2. WHEN a pinned memory is evaluated THEN the system SHALL skip all automatic lifecycle transitions including decay, archival, and expiration
3. WHEN unpinning a memory THEN the system SHALL resume normal lifecycle management based on current age and access patterns
4. WHEN listing pinned memories THEN the system SHALL provide a dedicated API endpoint with workspace scoping
5. WHERE a workspace is deleted THEN the system SHALL unpin all memories in that workspace before deletion
6. WHEN a memory is pinned THEN the system SHALL record a lifecycle event documenting the pin action and user

### Requirement 9

**User Story:** As a developer, I want decay functions to be configurable, so that I can tune memory relevance for different use cases.

#### Acceptance Criteria

1. WHEN configuring decay THEN the administrator SHALL specify decay function type (exponential, linear, step, custom)
2. WHEN using exponential decay THEN the system SHALL apply the formula: score = e^(-λt) where λ is the decay rate and t is time elapsed
3. WHEN using linear decay THEN the system SHALL apply the formula: score = max(0, 1 - (t / T)) where T is the decay period
4. WHEN using step decay THEN the system SHALL apply discrete score reductions at configured time intervals
5. WHERE a custom decay function is provided THEN the system SHALL validate the function returns values between 0 and 1

### Requirement 10

**User Story:** As a system administrator, I want lifecycle metrics and monitoring, so that I can optimize retention policies and storage usage.

#### Acceptance Criteria

1. WHEN querying lifecycle metrics THEN the system SHALL provide counts of memories in each lifecycle state per workspace
2. WHEN calculating storage metrics THEN the system SHALL report total storage used by active, archived, and expired memories
3. WHEN analyzing access patterns THEN the system SHALL provide statistics on memory access frequency distribution
4. WHEN evaluating policy effectiveness THEN the system SHALL report average memory lifespan and archival rates per memory type
5. WHEN metrics are requested THEN the system SHALL compute results efficiently using database aggregations rather than full scans

## Common Correctness Patterns

The following correctness properties should be validated through property-based testing:

1. **Invariants**: 
   - Decay scores always remain between 0 and 1
   - Pinned memories never transition to archived or expired states
   - Lifecycle state transitions follow valid state machine paths

2. **Round Trip Properties**:
   - Archiving then restoring a memory preserves all metadata and relationships
   - Decay score calculation is deterministic for a given timestamp

3. **Idempotence**:
   - Running lifecycle evaluation multiple times produces the same state transitions
   - Cleanup operations can be safely retried without duplicate deletions

4. **Metamorphic Properties**:
   - Accessing a memory always increases or maintains its importance score
   - For two memories with identical last_accessed_at timestamps, the one evaluated at a later time must have a lower or equal decay score

5. **Error Conditions**:
   - Invalid decay function configurations are rejected at initialization
   - Batch processing continues despite individual memory processing failures
