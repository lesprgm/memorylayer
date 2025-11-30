# Handoff Backend Test Suite

Comprehensive test coverage for all backend services and API endpoints.

## Test Structure

```
__tests__/
├── db.test.ts                  # DatabaseClient tests
├── conversation.test.ts        # ConversationService tests
├── memory.test.ts              # MemoryService tests
├── import.test.ts              # ImportService tests
├── export.test.ts              # ExportService tests
├── api-integration.test.ts     # Full API integration tests
├── setup.ts                    # Test setup and utilities
└── README.md                   # This file
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### With Coverage
```bash
npm run test:coverage
```

## Environment Setup

Tests require the following environment variables:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key  # Optional for import tests
```

Set these in `.dev.vars` file or export them before running tests.

## Test Coverage

### DatabaseClient (`db.test.ts`)
- ✅ Simple SELECT queries
- ✅ Parameterized queries
- ✅ Whitespace handling (leading/trailing)
- ✅ Empty result sets
- ✅ NULL values
- ✅ Array parameters
- ✅ JSON data types
- ✅ Special characters and escaping
- ✅ Large result sets
- ✅ Invalid SQL error handling
- ✅ Concurrent queries
- ✅ Timestamp data types
- ✅ Boolean values
- ✅ Numeric precision

### ConversationService (`conversation.test.ts`)
- ✅ Empty workspace handling
- ✅ List conversations with pagination
- ✅ Filter by provider
- ✅ Search by title and content
- ✅ SQL injection prevention
- ✅ Message count aggregation
- ✅ Get conversation by ID
- ✅ Include messages and memories
- ✅ Workspace isolation
- ✅ User attribution

### MemoryService (`memory.test.ts`)
- ✅ Empty workspace handling
- ✅ List memories with pagination
- ✅ Filter by memory types (single and multiple)
- ✅ Date range filtering
- ✅ Content search
- ✅ SQL injection prevention
- ✅ Get memory by ID
- ✅ Workspace isolation
- ✅ User attribution via conversations

### ImportService (`import.test.ts`)
- ✅ Invalid file format rejection
- ✅ Empty file handling
- ✅ JSON parse errors
- ✅ Valid Claude export import
- ✅ Conversations without messages
- ✅ Special characters in content
- ✅ Large conversation counts
- ✅ Unicode and emoji support
- ✅ Missing optional fields
- ✅ Job status tracking

### ExportService (`export.test.ts`)
- ✅ Export all workspace data
- ✅ Include messages in conversations
- ✅ Empty workspace handling
- ✅ Metadata generation
- ✅ Conversations without messages
- ✅ Create separate JSON files
- ✅ Valid JSON formatting
- ✅ Archive creation
- ✅ Combined JSON export

### API Integration (`api-integration.test.ts`)
- ✅ Authentication (valid/invalid API keys)
- ✅ GET /api/conversations (pagination, filters, search)
- ✅ GET /api/memories (type filters, date ranges)
- ✅ POST /api/import (file upload, validation)
- ✅ GET /api/export (data export)
- ✅ Error handling (404, 405, 400)
- ✅ CORS headers
- ✅ OPTIONS preflight requests
- ✅ Parameter validation
- ✅ Malformed request handling

## Edge Cases Covered

### Security
- SQL injection attempts in search queries
- Invalid API keys
- Workspace isolation (users can't access other workspaces)
- Special character escaping

### Data Integrity
- NULL value handling
- Empty arrays and objects
- Missing optional fields
- Unicode and emoji characters
- Large data sets

### Error Handling
- Invalid SQL queries
- Malformed JSON
- Invalid file formats
- Network errors
- Concurrent operations

### Performance
- Pagination with large datasets
- Concurrent query execution
- Large file imports
- Bulk operations

## Writing New Tests

### Test Template
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { YourService } from '../services/your-service'
import { DatabaseClient } from '../lib/db'

describe('YourService', () => {
  let db: DatabaseClient
  let service: YourService
  let testWorkspaceId: string

  beforeEach(async () => {
    // Setup test environment
    db = new DatabaseClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    )
    service = new YourService(db)
    
    // Create test data
    testWorkspaceId = crypto.randomUUID()
    await db.query(
      'INSERT INTO workspaces (id, name, type) VALUES ($1, $2, $3)',
      [testWorkspaceId, 'Test', 'personal']
    )
  })

  afterEach(async () => {
    // Clean up test data
    await db.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId])
  })

  describe('yourMethod', () => {
    it('should handle normal case', async () => {
      // Test implementation
    })

    it('should handle edge case', async () => {
      // Test implementation
    })
  })
})
```

### Best Practices
1. Always clean up test data in `afterEach`
2. Use unique IDs (crypto.randomUUID()) for test data
3. Test both success and failure cases
4. Include edge cases (empty, null, special chars)
5. Test security (SQL injection, auth)
6. Keep tests isolated and independent
7. Use descriptive test names

## Continuous Integration

Tests should be run:
- Before every commit
- In CI/CD pipeline
- Before deployment
- After database schema changes

## Troubleshooting

### Tests Failing
1. Check environment variables are set
2. Verify database connection
3. Ensure test data is cleaned up
4. Check for port conflicts (API integration tests)

### Slow Tests
1. Use `test:unit` to skip integration tests
2. Check database connection latency
3. Reduce test data size
4. Run tests in parallel (vitest default)

### Flaky Tests
1. Ensure proper cleanup in `afterEach`
2. Avoid timing-dependent assertions
3. Use unique test data IDs
4. Check for race conditions

## Contributing

When adding new features:
1. Write tests first (TDD)
2. Cover all edge cases
3. Update this README
4. Ensure all tests pass
5. Maintain >80% code coverage
