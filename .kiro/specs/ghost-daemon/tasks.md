# Implementation Plan - Ghost Daemon MVP

## Overview

This implementation plan breaks down the Ghost Daemon MVP into discrete coding tasks that build incrementally. Each task focuses on a specific component or integration point, with clear objectives and requirements references.

## Task List

- [x] 1. Set up project structure and dependencies
  - Create Ghost directory structure: `apps/ghost/` with subdirectories `daemon/`, `backend/`, `dashboard/`
  - Initialize package.json for each component with appropriate dependencies
  - Set up TypeScript configuration for all projects
  - Create shared types in each component as needed
  - _Requirements: 9_

- [x] 2. Implement Ghost Backend API foundation
  - [x] 2.1 Create Express/Hono server with basic routing
    - Set up server entry point with port configuration
    - Create route structure: `/api/command`, `/api/files/index`, `/api/dashboard/*`
    - Add CORS middleware for dashboard access
    - _Requirements: 2, 9_
  
  - [x] 2.2 Implement API key authentication middleware
    - Create auth middleware that validates Bearer token
    - Add error responses for missing/invalid API keys
    - _Requirements: 9_
  
  - [x] 2.3 Set up Storage Layer connection
    - Initialize StorageClient with DATABASE_URL
    - Create connection health check endpoint
    - Add error handling for database connection failures
    - _Requirements: 2, 8_
  
  - [x] 2.4 Initialize MemoryLayer components
    - Set up MemoryExtractor with OpenAI provider
    - Set up ContextEngine with OpenAI embeddings
    - Configure extraction profiles for Ghost
    - _Requirements: 2, 3_

- [x] 3. Implement command processing service
  - [x] 3.1 Create CommandProcessor class
    - Implement conversation storage for incoming commands
    - Add user message to conversation
    - Return structured response format
    - _Requirements: 2_
  
  - [x] 3.2 Implement ContextBuilder wrapper
    - Create Ghost-specific context template
    - Implement buildContext method with Ghost defaults
    - Add PII redaction logic (emails, file paths)
    - _Requirements: 2, 3_
  
  - [x] 3.3 Implement LLMCoordinator
    - Create OpenAI client with JSON mode
    - Build prompt template with context and available actions
    - Parse and validate LLM response structure
    - Implement safe fallback for malformed responses
    - _Requirements: 2_
  
  - [x] 3.4 Integrate async memory extraction
    - Trigger MemoryExtractor after command response
    - Run extraction in background without blocking
    - Log extraction errors without failing command
    - _Requirements: 3_
  
  - [x] 3.5 Implement POST /api/command endpoint
    - Validate request body structure
    - Call CommandProcessor.process()
    - Return CommandResponse with actions and memories
    - Handle errors gracefully with appropriate status codes
    - _Requirements: 2, 8_

- [x] 4. Implement file indexing service
  - [x] 4.1 Create FileIndexer class
    - Implement file metadata to memory conversion
    - Create synthetic conversation for file index
    - Store file entity memories with metadata
    - _Requirements: 7_
  
  - [x] 4.2 Implement POST /api/files/index endpoint
    - Validate file metadata array
    - Call FileIndexer.indexFiles()
    - Return success/error response
    - _Requirements: 7_

- [x] 5. Implement dashboard API endpoints
  - [x] 5.1 Create GET /api/dashboard/commands endpoint
    - Query recent conversations from Storage Layer
    - Include actions and memories used for each command
    - Support limit parameter for pagination
    - Return DashboardData structure
    - _Requirements: 6_
  
  - [x] 5.2 Create GET /api/dashboard/stats endpoint
    - Calculate total commands, memories, success rate
    - Return DashboardStats structure
    - _Requirements: 6_

- [x] 6. Implement Ghost Daemon foundation (Electron)
  - [x] 6.1 Set up Electron app structure
    - Create main process entry point
    - Set up IPC communication between main and renderer
    - Configure app to run in system tray (hidden window)
    - _Requirements: 1_
  
  - [x] 6.2 Implement configuration management
    - Create config.json schema and example file
    - Load configuration on startup
    - Validate required fields (backend URL, API key, user ID)
    - Display error if config is invalid
    - _Requirements: 9_
  
  - [x] 6.3 Create GhostAPIClient
    - Implement sendCommand method with fetch/axios
    - Implement indexFiles method
    - Implement getDashboardData method
    - Add timeout and error handling
    - _Requirements: 2, 7, 8_

- [x] 7. Implement voice pipeline
  - [x] 7.1 Create HotkeyHandler
    - Register global hotkey (Alt+Space) using electron-globalshortcut
    - Trigger callback when hotkey is pressed
    - Show visual indicator (tray icon change)
    - _Requirements: 1_
  
  - [x] 7.2 Implement VoicePipeline for recording
    - Initialize microphone access with permissions check
    - Start/stop audio recording
    - Detect silence using audio level monitoring
    - Play chime sound on activation
    - _Requirements: 1_
  
  - [x] 7.3 Integrate OpenAI Whisper for STT
    - Send recorded audio to Whisper API
    - Handle API errors with user-friendly messages
    - Strip "Hey Ghost" prefix if present
    - _Requirements: 1, 8_

- [x] 8. Implement text-to-speech
  - [x] 8.1 Create TextToSpeech class
    - Implement system TTS (macOS: say, Windows: SAPI, Linux: espeak)
    - Add speak() method with text parameter
    - Add stop() method to interrupt speech
    - Show visual indicator while speaking
    - _Requirements: 5_

- [x] 9. Implement action executor
  - [x] 9.1 Create ActionExecutor class
    - Implement execute() method that dispatches by action type
    - Implement executeBatch() for multiple actions
    - Return ActionResult with status and timestamp
    - _Requirements: 4_
  
  - [x] 9.2 Implement file.open action
    - Validate file path exists
    - Prevent path traversal attacks
    - Use execFile to open with system default app
    - Handle cross-platform differences (open/start/xdg-open)
    - _Requirements: 4_
  
  - [x] 9.3 Implement info.recall action
    - Display system notification with summary text
    - Use Electron Notification API
    - _Requirements: 4_

- [x] 10. Implement file scanner
  - [x] 10.1 Create FileScanner class
    - Implement scan() method using fast-glob
    - Apply depth limit (default: 3)
    - Apply file count limit (default: 1000)
    - Filter by include/exclude patterns
    - _Requirements: 7_
  
  - [x] 10.2 Add scan command to daemon
    - Create IPC handler for scan request
    - Call FileScanner.scan() with configured directories
    - Send results to backend via indexFiles()
    - Show progress notification
    - _Requirements: 7_

- [x] 11. Wire up complete command flow in daemon
  - [x] 11.1 Integrate all components in main process
    - Connect hotkey → voice pipeline → API client → TTS → action executor
    - Handle errors at each step with appropriate user feedback
    - Log events for debugging
    - _Requirements: 1, 2, 4, 5, 8_
  
  - [x] 11.2 Implement end-to-end command processing
    - User presses hotkey
    - Record voice and get transcript
    - Send to backend
    - Speak response
    - Execute actions
    - _Requirements: 1, 2, 4, 5_

- [x] 12. Implement Ghost Dashboard (React/Vue)
  - [x] 12.1 Set up dashboard app structure
    - Create React/Vue app with Vite
    - Set up routing (if needed)
    - Configure API client to backend
    - _Requirements: 6_
  
  - [x] 12.2 Create CommandList component
    - Display chronological list of commands
    - Show user text, assistant text, timestamp
    - Show action count and memory count
    - Poll backend every 2 seconds for updates
    - _Requirements: 6_
  
  - [x] 12.3 Create MemoryCard component
    - Display memory type, content snippet, relevance score
    - Format score as percentage
    - _Requirements: 6_
  
  - [x] 12.4 Create ActionStatus component
    - Display action type and status (success/failed)
    - Show error message if failed
    - _Requirements: 6_
  
  - [x] 12.5 Wire up dashboard with live data
    - Fetch commands from /api/dashboard/commands
    - Display in CommandList with nested MemoryCard and ActionStatus
    - Add simple styling for readability
    - _Requirements: 6_

- [x] 13. Create demo data and test scenarios
  - [x] 13.1 Seed file memories for demo
    - Create test files in Documents folder
    - Run file scanner to index them
    - Verify memories are created in database
    - _Requirements: 7_
  
  - [x] 13.2 Test "file recall by description" scenario
    - Command: "open the report from yesterday"
    - Verify correct file is identified and opened
    - Verify dashboard shows memories used
    - _Requirements: 2, 3, 4_
  
  - [x] 13.3 Test "information recall" scenario
    - Seed fact memories about a topic (e.g., "ACME Q4 launch")
    - Command: "what do I know about ACME Q4 launch?"
    - Verify summary is displayed in notification
    - Verify dashboard shows memories used
    - _Requirements: 2, 3, 4_
  
  - [x] 13.4 Test "context-aware file + person" scenario
    - Seed file and person entity memories
    - Command: "show me the presentation for Sarah's meeting"
    - Verify both entities are used in context
    - Verify correct file is opened
    - _Requirements: 2, 3, 4_

- [x] 14. Polish and deployment preparation
  - [x] 14.1 Add error handling and user feedback
    - Implement priority error messages (STT failed, backend offline, file not found)
    - Show appropriate notifications for each error type
    - _Requirements: 8_
  
  - [x] 14.2 Create configuration examples and documentation
    - Create config.example.json with comments
    - Create .env.example for backend
    - Write README with setup instructions
    - _Requirements: 9_
  
  - [x] 14.3 Package daemon for distribution
    - Configure Electron builder for macOS/Windows/Linux
    - Test packaged app on target platform
    - _Requirements: 9_

  - [x] 14.4 Deploy backend and dashboard
    - Deploy backend to hosting service (Railway/Fly.io)
    - Deploy dashboard to static hosting (Vercel/Netlify)
    - Configure environment variables
    - Test deployed services
    - _Requirements: 9_
  

## Project Structure

All Ghost components are organized under `apps/ghost/`:
- `apps/ghost/daemon/` - Electron desktop application
- `apps/ghost/backend/` - Express/Hono API server
- `apps/ghost/dashboard/` - React/Vue web interface

This keeps all Ghost-related code together and makes it easy to manage as a cohesive project.

## Notes

- Tasks are designed to be completed in order, with each building on previous work
- Focus on P0 (must-have) functionality only; defer P1/P2 features
- Test each component individually before integration
- Keep implementations minimal - avoid over-engineering
- Use existing MemoryLayer packages without modification
- Prioritize the 3 demo scenarios over comprehensive coverage

## Testing Approach

- Unit test critical logic (command processor, action executor, file scanner)
- Integration test with real Storage Layer and MemoryLayer components
- Manual test voice pipeline and TTS (hard to automate)
- End-to-end test the 3 demo scenarios
- Test on target platform (macOS for MVP)

## Time Estimates (Rough)

- Backend API: 3-4 days
- Daemon core: 3-4 days
- Voice pipeline: 2 days
- Dashboard: 1-2 days
- Integration & testing: 2-3 days
- Polish & deployment: 1-2 days

**Total: ~14 days** (with some buffer for unexpected issues)
