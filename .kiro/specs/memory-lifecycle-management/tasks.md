# Implementation Plan

- [x] 1. Database schema and migrations
  - Add lifecycle columns to memories table (lifecycle_state, last_accessed_at, access_count, importance_score, decay_score, effective_ttl, pinned, pinned_by, pinned_at, archived_at, expires_at)
  - Create indexes for lifecycle queries (lifecycle_state, last_accessed_at, expires_at, pinned)
  - Create archived_memories table for cold storage
  - Create lifecycle_events table for audit trail
  - Write migration scripts for both SQLite and Postgres
  - Initialize default values for existing memories
  - _Requirements: 1.1, 2.1, 3.1, 6.1, 8.1_

- [-] 2. Core decay calculation
- [x] 2.1 Implement DecayCalculator class
  - Create DecayFunction interface and types
  - Implement exponential decay function
  - Implement linear decay function
  - Implement step decay function
  - Add custom decay function support with validation
  - Implement calculateDecayScore() method
  - _Requirements: 1.2, 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 2.2 Write property test for decay score bounds
  - **Property 1: Decay score bounds**
  - **Validates: Requirements - Invariants**

- [x] 2.3 Write property test for decay determinism
  - **Property 5: Decay determinism**
  - **Validates: Requirements - Round Trip Properties**

- [x] 2.4 Write property test for decay monotonicity
  - **Property 8: Decay monotonicity**
  - **Validates: Requirements - Metamorphic Properties**

- [ ]* 2.5 Write unit tests for decay functions
  - Test exponential decay with various lambda values
  - Test linear decay with various periods
  - Test step decay with multiple intervals
  - Test custom decay function validation
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 3. Importance scoring system
- [x] 3.1 Implement ImportanceScorer class
  - Create AccessMetrics interface
  - Implement calculateImportance() method
  - Implement calculateAccessFrequency() helper
  - Implement normalize() helper using sigmoid function
  - Add configurable importance weights
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 3.2 Write property test for importance monotonicity
  - **Property 7: Importance monotonicity**
  - **Validates: Requirements 4.1, Metamorphic Properties**

- [x] 3.3 Write property test for TTL extension
  - **Property 9: TTL extension**
  - **Validates: Requirements 4.3**

- [ ]* 3.4 Write unit tests for importance scoring
  - Test importance calculation with various access patterns
  - Test access frequency calculation
  - Test normalization with different parameters
  - Test weight combinations
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Lifecycle state management
- [x] 4.1 Implement LifecycleEventLogger class
  - Create LifecycleEvent interface
  - Implement logTransition() method
  - Implement getHistory() method
  - Implement getRecentTransitions() method
  - Add database operations for lifecycle_events table
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 4.2 Implement state machine validation
  - Define valid state transitions
  - Create validateTransition() function
  - Add state transition guards for pinned memories
  - Implement transition reason generation
  - _Requirements: Lifecycle State Machine, 8.2_

- [x] 4.3 Write property test for state transition validity
  - **Property 3: State transition validity**
  - **Validates: Requirements - Lifecycle State Machine**

- [x] 4.4 Write property test for pinned memories immunity
  - **Property 2: Pinned memories immunity**
  - **Validates: Requirements 8.2**

- [ ]* 4.5 Write unit tests for state machine
  - Test all valid transitions
  - Test rejection of invalid transitions
  - Test pinned memory guards
  - Test transition logging
  - _Requirements: Lifecycle State Machine, 6.1, 8.2_

- [-] 5. Archival service
- [x] 5.1 Implement ArchivalService class
  - Create ArchivalOptions interface
  - Implement archiveBatch() method
  - Implement restore() method
  - Implement listArchived() method
  - Add database operations for archived_memories table
  - Implement vector index removal during archival
  - Implement vector index restoration during restore
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5.2 Write property test for archival preservation
  - **Property 4: Archival preservation**
  - **Validates: Requirements 3.3**

- [x] 5.3 Write integration tests for archival
  - Test archival with vector index removal
  - Test restoration with vector index re-indexing
  - Test archival with relationships
  - Test pagination of archived memories
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Cleanup service
- [x] 6.1 Implement CleanupService class
  - Create CleanupOptions and CleanupResult interfaces
  - Implement cleanupExpired() method
  - Implement cleanupLifecycleEvents() method
  - Add batch processing with error handling
  - Add dry-run mode for testing
  - Calculate storage reclaimed metrics
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.4_

- [x] 6.2 Write property test for cleanup safety
  - **Property 10: Cleanup safety**
  - **Validates: Requirements 5.2**

- [x] 6.3 Write integration tests for cleanup service
  - Test expired memory deletion
  - Test lifecycle event cleanup
  - Test batch processing with errors
  - Test storage metrics calculation
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. Lifecycle manager orchestration
- [x] 7.1 Implement LifecycleManager class core
  - Create LifecycleConfig interface
  - Implement constructor with dependency injection
  - Implement recordAccess() method
  - Implement pinMemory() and unpinMemory() methods
  - Implement archiveMemory() and restoreMemory() methods
  - Implement getMetrics() method
  - _Requirements: 1.3, 4.1, 8.1, 8.3, 10.1, 10.2_

- [x] 7.2 Implement batch evaluation logic
  - Implement evaluateBatch() method
  - Calculate decay scores for batch
  - Check TTL thresholds and effective TTL
  - Determine state transitions
  - Update lifecycle states in database
  - Trigger archival for memories exceeding TTL
  - Log all state transitions
  - _Requirements: 1.4, 1.5, 2.2, 2.3, 4.3, 7.2_

- [x] 7.3 Write property test for idempotent evaluation
  - **Property 6: Idempotent evaluation**
  - **Validates: Requirements - Idempotence**

- [x] 7.4 Write property test for batch processing resilience
  - **Property 12: Batch processing resilience**
  - **Validates: Requirements 7.4, Error Conditions**

- [ ]* 7.5 Write unit tests for lifecycle manager
  - Test recordAccess updates
  - Test pin/unpin operations
  - Test manual archive/restore
  - Test metrics calculation
  - Test batch evaluation logic
  - _Requirements: 1.3, 4.1, 7.2, 8.1, 8.3, 10.1_

- [x] 8. Background job scheduling
- [x] 8.1 Implement background job system
  - Implement startBackgroundJobs() method
  - Implement stopBackgroundJobs() method
  - Create periodic evaluation job
  - Create cleanup job with separate interval
  - Add job execution metrics logging (duration_ms)
  - Add error handling and retry logic
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8.2 Write integration tests for background jobs
  - Test periodic evaluation execution
  - Test cleanup job execution
  - Test job error handling
  - Test job metrics logging
  - Test job start/stop lifecycle
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 9. Storage client integration
- [ ] 9.1 Extend StorageClient with lifecycle methods
  - Add updateMemoryLifecycle() method
  - Add getMemoriesByLifecycleState() method
  - Extend searchMemories() with includeArchived flag
  - Update memory access tracking in getMemory()
  - Add lifecycle field initialization in createMemory()
  - _Requirements: 1.1, 3.5, Integration with Existing Components_

- [ ]* 9.2 Write integration tests for storage client
  - Test lifecycle field updates
  - Test state-based queries
  - Test archived memory search
  - Test access tracking
  - Test with SQLite backend
  - Test with Postgres backend
  - _Requirements: 1.1, 3.5, Integration with Existing Components_

- [ ] 10. Context engine integration
- [ ] 10.1 Extend ContextEngine ranking with decay scores
  - Modify MemoryRanker.defaultRanking() to multiply by decay_score
  - Update ranking options to include decay weight
  - Ensure decay scores are included in search results
  - Update context building to respect lifecycle states
  - _Requirements: 1.4, Integration with Existing Components_

- [ ]* 10.2 Write integration tests for context engine
  - Test decay score impact on ranking
  - Test that decayed memories rank lower
  - Test that pinned memories are not affected
  - Test context building with lifecycle states
  - _Requirements: 1.4, Integration with Existing Components_

- [ ] 11. Configuration and validation
- [ ] 11.1 Implement configuration validation
  - Validate retention policies
  - Validate decay function parameters
  - Validate importance weights sum to reasonable range
  - Validate batch sizes and intervals
  - Add configuration schema
  - _Requirements: 2.1, 9.1, 9.5_

- [x] 11.2 Write property test for invalid config rejection
  - **Property 11: Invalid config rejection**
  - **Validates: Requirements - Error Conditions**

- [ ]* 11.3 Write unit tests for configuration
  - Test valid configurations
  - Test invalid retention policies
  - Test invalid decay functions
  - Test invalid importance weights
  - Test default value application
  - _Requirements: 2.1, 9.1, 9.5_

- [ ] 12. Metrics and monitoring
- [ ] 12.1 Implement lifecycle metrics collection
  - Implement getMetrics() with state counts
  - Calculate storage usage by state
  - Calculate access pattern statistics
  - Calculate average lifespan per memory type
  - Add archival rate calculation
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 12.2 Write unit tests for metrics
  - Test state count aggregation
  - Test storage usage calculation
  - Test access pattern statistics
  - Test lifespan calculation
  - Test efficient query execution
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 13. Error handling and logging
- [ ] 13.1 Implement comprehensive error handling
  - Define LifecycleError types
  - Add error context to all operations
  - Implement graceful degradation
  - Add retry logic for transient failures
  - Log all errors with context
  - _Requirements: 5.5, 7.4, Error Handling_

- [ ]* 13.2 Write unit tests for error handling
  - Test error type classification
  - Test error context propagation
  - Test graceful degradation
  - Test retry logic
  - Test error logging
  - _Requirements: 5.5, 7.4, Error Handling_

- [ ] 14. Documentation and examples
- [ ] 14.1 Write API documentation
  - Document LifecycleManager API
  - Document configuration options
  - Document decay functions
  - Document retention policies
  - Add JSDoc comments to all public methods
  - _Requirements: All_

- [ ] 14.2 Create usage examples
  - Basic lifecycle configuration example
  - Custom decay function example
  - Manual pin/archive example
  - Metrics querying example
  - Background job setup example
  - _Requirements: All_

- [ ] 14.3 Write migration guide
  - Document schema migration steps
  - Document rollout strategy
  - Document performance tuning
  - Document monitoring setup
  - Add troubleshooting guide
  - _Requirements: Migration Strategy_

- [ ] 15. End-to-end integration testing
- [ ]* 15.1 Write end-to-end lifecycle tests
  - Test complete lifecycle: create → access → decay → archive → restore → cleanup
  - Test with multiple memory types
  - Test with different retention policies
  - Test with background jobs running
  - Test with high memory volume (10,000+ memories)
  - _Requirements: All_

- [ ] 16. Performance optimization
- [ ] 16.1 Optimize batch processing
  - Profile batch evaluation performance
  - Add database query optimization
  - Implement parallel processing where safe
  - Add caching for decay calculations
  - Tune batch sizes based on profiling
  - _Requirements: 7.2, Performance Considerations_

- [ ]* 16.2 Write performance tests
  - Test batch evaluation with 10,000 memories (< 5s)
  - Test decay calculation for 1,000 memories (< 100ms)
  - Test archival of 1,000 memories (< 10s)
  - Test cleanup of 1,000 memories (< 5s)
  - _Requirements: Performance Tests_

- [ ] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
