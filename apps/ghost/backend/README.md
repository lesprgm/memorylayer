# Ghost Backend

Backend API server for Ghost daemon, handling command processing, memory extraction, context retrieval, and semantic search.

## Features

- **Command Processing**: Processes voice commands with LLM integration (Gemini)
- **Memory Layer**: SQLite + Vector database for semantic memory storage and retrieval
- **Screen Context**: Stores screenshot paths and OCR text as `context.screen` memories
- **Semantic Search**: `/api/search` endpoint for fuzzy memory queries
- **AI Explainability**: Stores reasoning context and memory graphs
- **Memory Consolidation**: Deduplicates and merges similar memories

## Setup

1. Copy `.env.example` to `.env` and fill in your settings
2. Install dependencies: `npm install`
3. Run in development: `npm run dev`
4. Build for production: `npm run build`
5. Start production server: `npm start`

## API Endpoints

### Core
- `POST /api/command` - Process voice command (Bearer API key required)
- `POST /api/command/stream` - Process command with streaming response
- `GET /health` - Health check (includes storage status)

### Memory & Search
- `POST /api/files/index` - Index files for memory
- `GET /api/search?q={query}&userId={id}&limit={n}` - Semantic search over memories

### Dashboard
- `GET /api/dashboard/commands` - Get command history
- `GET /api/dashboard/stats` - Get statistics
- `GET /api/dashboard/stream` - SSE stream for latest command

### Explainability
- `POST /api/explain/store` - Store explanation context
- `GET /api/explain/:commandId` - Retrieve explanation for a command

### Memory Consolidation
- `POST /api/memories/consolidate` - Trigger memory consolidation
- `GET /api/memories/:id/history` - Get version history

## Environment Variables

See `.env.example` for all required variables:
- `GEMINI_API_KEY` - Required for LLM processing
- `GEMINI_MODEL` - Model to use (e.g., `gemini-2.0-flash-exp`)
- `PORT` - Server port (default: 4000)
- `API_KEY` - Bearer token for authentication

## Testing

Run tests:
```bash
npm test
```

Test coverage: **92%** (55/60 tests passing)

## Database

Ghost uses SQLite with the following key tables:
- `memories` - All memories (files, conversations, screenshots)
- `commands` - Command history
- `actions` - Executed actions
- `relationships` - Memory-to-memory links
- `explanation_contexts` - AI reasoning explanations

Screenshot memories are stored as type `context.screen` with metadata containing the file path.
