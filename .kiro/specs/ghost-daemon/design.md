# Ghost Daemon Design - MVP

## Overview

Ghost is a voice-activated AI assistant daemon that provides an "AI OS" experience by combining voice interaction with MemoryLayer's context engine. The system consists of two main components: the Ghost Daemon (local desktop application) and the Ghost Dashboard (web visualization interface). The daemon handles voice input/output and local action execution, while the Backend API manages memory extraction, context retrieval, and LLM coordination.

**MVP Focus**: This design targets a 14-day hackathon build with 2-3 bulletproof demo scenarios showcasing MemoryLayer's ability to interpret vague, context-dependent voice commands.

## Architecture

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User's Machine                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Ghost Daemon (Electron/Tauri)             │ │
│  │                                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │   Hotkey     │  │    Voice     │  │   Action    │ │ │
│  │  │   Handler    │  │   Pipeline   │  │  Executor   │ │ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │ │
│  │         │                 │                  │        │ │
│  │         └─────────────────┴──────────────────┘        │ │
│  │                           │                           │ │
│  └───────────────────────────┼───────────────────────────┘ │
│                              │                             │
└──────────────────────────────┼─────────────────────────────┘
                               │ HTTPS/JSON
                               │
┌──────────────────────────────┼─────────────────────────────┐
│                         Backend API                         │
│                              │                              │
│  ┌───────────────────────────┴──────────────────────────┐  │
│  │              Command Processing Service              │  │
│  │                                                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │  Memory  │  │ Context  │  │  LLM Coordinator │  │  │
│  │  │Extraction│  │  Engine  │  │  (Action Plan)   │  │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │                              │
│  ┌───────────────────────────┴──────────────────────────┐  │
│  │              Storage Layer (Postgres)                │  │
│  │  - conversations  - memories  - relationships        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Ghost Dashboard (Static Web App)             │  │
│  │  - Command transcript  - Memory visualization        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure

```
apps/ghost/                         # All Ghost components
├── daemon/                         # Electron/Tauri desktop app
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts           # Main process entry
│   │   │   ├── hotkey.ts          # Global hotkey registration
│   │   │   ├── voice-pipeline.ts  # Voice recording & STT
│   │   │   ├── tts.ts             # Text-to-speech
│   │   │   ├── action-executor.ts # Local action execution
│   │   │   ├── api-client.ts      # Backend API client
│   │   │   ├── file-scanner.ts    # File indexing
│   │   │   └── config.ts          # Configuration management
│   │   ├── renderer/              # (Optional) Settings UI
│   │   └── types.ts               # Shared types
│   ├── config.example.json
│   └── package.json
│
├── backend/                        # Backend API (Express/Hono)
│   ├── src/
│   │   ├── index.ts               # API server entry
│   │   ├── routes/
│   │   │   ├── command.ts         # POST /api/command
│   │   │   ├── files.ts           # POST /api/files/index
│   │   │   └── dashboard.ts       # GET /api/dashboard/*
│   │   ├── services/
│   │   │   ├── command-processor.ts   # Main command processing logic
│   │   │   ├── memory-manager.ts      # Memory extraction coordination
│   │   │   ├── context-builder.ts     # Context retrieval
│   │   │   ├── llm-coordinator.ts     # LLM prompt building & parsing
│   │   │   └── file-indexer.ts        # File memory creation
│   │   ├── middleware/
│   │   │   └── auth.ts            # API key authentication
│   │   └── types.ts               # API types
│   └── package.json
│
└── dashboard/                      # Web dashboard (React/Vue)
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── CommandList.tsx    # Command transcript
    │   │   ├── MemoryCard.tsx     # Memory visualization
    │   │   └── ActionStatus.tsx   # Action execution status
    │   ├── api.ts                 # Dashboard API client
    │   └── types.ts
    └── package.json
```

## Components and Interfaces

### Ghost Daemon

#### Hotkey Handler

```typescript
class HotkeyHandler {
  constructor(config: HotkeyConfig)
  
  // Register global hotkey
  register(hotkey: string, callback: () => void): void
  
  // Unregister hotkey
  unregister(): void
}

interface HotkeyConfig {
  hotkey: string              // Default: 'Alt+Space'
  enableNotifications: boolean
}
```

#### Voice Pipeline

```typescript
class VoicePipeline {
  constructor(config: VoiceConfig)
  
  // Start recording
  async startRecording(): Promise<void>
  
  // Stop recording and get transcript
  async stopRecording(): Promise<Result<string, VoiceError>>
  
  // Get recording status
  isRecording(): boolean
  
  // Play chime sound
  playChime(): void
}

interface VoiceConfig {
  sttProvider: 'openai' | 'google' | 'system'
  sttApiKey?: string
  silenceThreshold: number    // Seconds of silence to auto-stop
  maxRecordingDuration: number // Max seconds
  chimeSound: string          // Path to audio file
}

type VoiceError =
  | { type: 'microphone_access_denied' }
  | { type: 'stt_failed'; message: string }
  | { type: 'recording_timeout' }
```

**Implementation Notes**:
- Use `node-record-lpcm16` or similar for audio capture
- For MVP, use OpenAI Whisper API for STT (reliable, good quality)
- Detect silence using audio level monitoring
- Show visual indicator during recording (system tray icon change or overlay)

#### Text-to-Speech

```typescript
class TextToSpeech {
  constructor(config: TTSConfig)
  
  // Speak text
  async speak(text: string): Promise<void>
  
  // Stop current speech
  stop(): void
  
  // Check if speaking
  isSpeaking(): boolean
}

interface TTSConfig {
  provider: 'system' | 'openai' | 'elevenlabs'
  apiKey?: string
  voice?: string
  rate?: number               // Speech rate (0.5 - 2.0)
}
```

**Implementation Notes**:
- For MVP, use system TTS (macOS: `say`, Windows: SAPI, Linux: `espeak`)
- System TTS is free, fast, and requires no API calls
- Can upgrade to OpenAI TTS or ElevenLabs post-MVP for better quality

#### Action Executor

```typescript
class ActionExecutor {
  // Execute action from backend response
  async execute(action: Action): Promise<ActionResult>
  
  // Execute multiple actions in sequence
  async executeBatch(actions: Action[]): Promise<ActionResult[]>
}

interface Action {
  type: 'file.open' | 'info.recall'
  params: Record<string, any>
}

interface ActionResult {
  action: Action
  status: 'success' | 'failed'
  error?: string
  executedAt: string
}
```

**Action Implementations**:

```typescript
// file.open
async function executeFileOpen(params: { path: string }): Promise<ActionResult> {
  const { path } = params
  
  // Validate file exists
  if (!fs.existsSync(path)) {
    return { status: 'failed', error: 'File not found' }
  }
  
  // Validate path (prevent path traversal)
  const resolvedPath = path.resolve(path)
  if (!resolvedPath.startsWith(os.homedir())) {
    return { status: 'failed', error: 'Invalid path' }
  }
  
  // Open with system default app (properly escaped)
  const command = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open'
  
  // Use execFile for safer execution (no shell injection)
  await execFile(command, [path])
  
  return { status: 'success', executedAt: new Date().toISOString() }
}

// info.recall
async function executeInfoRecall(params: { summary: string }): Promise<ActionResult> {
  const { summary } = params
  
  // Show system notification
  new Notification('Ghost', {
    body: summary,
    icon: 'ghost-icon.png'
  })
  
  return { status: 'success', executedAt: new Date().toISOString() }
}
```

#### API Client

```typescript
class GhostAPIClient {
  constructor(config: APIConfig)
  
  // Send command to backend
  async sendCommand(command: CommandRequest): Promise<Result<CommandResponse, APIError>>
  
  // Index files
  async indexFiles(files: FileMetadata[]): Promise<Result<void, APIError>>
  
  // Get dashboard data
  async getDashboardData(limit?: number): Promise<Result<DashboardData, APIError>>
}

interface APIConfig {
  baseUrl: string
  apiKey: string
  timeout: number             // Request timeout in ms
}

interface CommandRequest {
  user_id: string
  command_id: string
  text: string
  timestamp: string
  meta: {
    source: 'voice'
    client_version: string
  }
}

interface CommandResponse {
  command_id: string
  assistant_text: string
  actions: Action[]
  memories_used: MemoryReference[]
}

interface MemoryReference {
  id: string
  type: string
  score: number
  summary: string
}

type APIError =
  | { type: 'network_error'; message: string }
  | { type: 'auth_error'; message: string }
  | { type: 'server_error'; status: number; message: string }
  | { type: 'timeout' }
```

#### File Scanner

```typescript
class FileScanner {
  constructor(config: ScanConfig)
  
  // Scan directories for files
  async scan(directories: string[]): Promise<FileMetadata[]>
  
  // Filter files by extension/pattern
  filter(files: FileMetadata[], patterns: string[]): FileMetadata[]
}

interface ScanConfig {
  maxDepth: number            // Max directory depth
  excludePatterns: string[]   // Glob patterns to exclude
  includeExtensions: string[] // File extensions to include
}

interface FileMetadata {
  path: string
  name: string
  modified: string            // ISO 8601
  size: number                // Bytes
}
```

**Implementation Notes**:
- Use `glob` or `fast-glob` for efficient scanning
- Default exclude patterns: `node_modules`, `.git`, `dist`, `build`
- Default include extensions: `.pdf`, `.docx`, `.txt`, `.md`, `.pptx`, `.xlsx`
- For MVP, scan on demand (button in settings or CLI command)
- **Limit scan depth** (default: 3 levels) and file count (default: 1000 files max)
- **Handle paths safely**: escape spaces and special characters before passing to system commands

### Ghost Backend

#### Command Processor

```typescript
class CommandProcessor {
  constructor(
    memoryManager: MemoryManager,
    contextBuilder: ContextBuilder,
    llmCoordinator: LLMCoordinator,
    storageClient: StorageClient
  )
  
  // Process incoming command
  async process(request: CommandRequest): Promise<Result<CommandResponse, ProcessError>>
}
```

**Processing Flow**:

1. **Store Command as Conversation Turn**
   ```typescript
   const conversation = await storageClient.createConversation({
     workspace_id: workspaceId,
     provider: 'ghost',
     external_id: request.command_id,
     title: request.text.substring(0, 50),
     messages: [{
       role: 'user',
       content: request.text,
       created_at: request.timestamp
     }]
   })
   ```

2. **Retrieve Context from MemoryLayer**
   ```typescript
   const contextResult = await contextBuilder.buildContext(
     request.text,
     workspaceId,
     {
       template: 'ghost-command',
       tokenBudget: 1500,
       includeRelationships: true,
       memoryTypes: ['entity.file', 'entity.person', 'fact']
     }
   )
   
   const context = contextResult.ok ? contextResult.value.context : ''
   const memoriesUsed = contextResult.ok ? contextResult.value.memories : []
   ```

3. **Build LLM Prompt**
   ```typescript
   const prompt = `You are Ghost, a voice-activated AI assistant. You help users with file management and information recall.

Available actions:
- file.open: Open a file on the user's machine
- info.recall: Display information to the user

${context}

User command: "${request.text}"

Respond with:
1. A brief spoken response (1-2 sentences)
2. Actions to execute (if any)

Format your response as JSON:
{
  "assistant_text": "your spoken response",
  "actions": [
    { "type": "file.open", "params": { "path": "/absolute/path" } }
  ]
}`
   ```

4. **Call LLM and Parse Response**
   ```typescript
   const llmResponse = await llmCoordinator.complete(prompt)
   const parsed = JSON.parse(llmResponse)
   ```

5. **Store Assistant Response**
   ```typescript
   await storageClient.addMessage(conversation.id, {
     role: 'assistant',
     content: parsed.assistant_text,
     created_at: new Date().toISOString()
   })
   ```

6. **Trigger Memory Extraction (Async)**
   ```typescript
   // Don't await - run in background
   memoryManager.extractFromConversation(conversation.id, workspaceId)
     .catch(err => logger.error('Memory extraction failed', err))
   ```

7. **Return Response**
   ```typescript
   return {
     ok: true,
     value: {
       command_id: request.command_id,
       assistant_text: parsed.assistant_text,
       actions: parsed.actions,
       memories_used: memoriesUsed.map(m => ({
         id: m.memory.id,
         type: m.memory.type,
         score: m.score,
         summary: m.memory.content.substring(0, 100)
       }))
     }
   }
   ```

#### Memory Manager

```typescript
class MemoryManager {
  constructor(
    memoryExtractor: MemoryExtractor,
    storageClient: StorageClient
  )
  
  // Extract memories from conversation (async)
  async extractFromConversation(
    conversationId: string,
    workspaceId: string
  ): Promise<void>
  
  // Create file entity memories
  async indexFiles(
    files: FileMetadata[],
    workspaceId: string,
    userId: string
  ): Promise<void>
}
```

**File Indexing Implementation**:

```typescript
async indexFiles(files: FileMetadata[], workspaceId: string, userId: string) {
  // Create a synthetic conversation for file indexing
  const conversation = await storageClient.createConversation({
    workspace_id: workspaceId,
    provider: 'ghost',
    external_id: `file-index-${Date.now()}`,
    title: 'File Index',
    messages: [{
      role: 'system',
      content: `Indexed ${files.length} files`,
      created_at: new Date().toISOString()
    }]
  })
  
  // Create entity memories for each file
  const memories = files.map(file => ({
    type: 'entity.file',
    content: `File: ${file.name} at ${file.path}`,
    confidence: 1.0,
    workspace_id: workspaceId,
    conversation_id: conversation.id,
    source_message_ids: [conversation.messages[0].id],
    metadata: {
      entity_type: 'file',
      name: file.name,
      path: file.path,
      modified: file.modified,
      size: file.size
    },
    created_at: new Date().toISOString()
  }))
  
  // Store memories
  for (const memory of memories) {
    await storageClient.createMemory(memory)
  }
}
```

#### Context Builder

Wrapper around the existing Context Engine with Ghost-specific configuration:

```typescript
class ContextBuilder {
  constructor(contextEngine: ContextEngine)
  
  async buildContext(
    query: string,
    workspaceId: string,
    options?: ContextOptions
  ): Promise<Result<ContextResult, ContextError>> {
    // Add Ghost-specific template if not exists
    this.ensureGhostTemplate()
    
    // Call context engine with Ghost defaults
    return contextEngine.buildContext(query, workspaceId, {
      template: 'ghost-command',
      tokenBudget: 1500,
      ranker: 'default',
      includeRelationships: true,
      relationshipDepth: 1,
      ...options
    })
  }
  
  private ensureGhostTemplate() {
    contextEngine.registerTemplate('ghost-command', {
      name: 'ghost-command',
      header: 'Relevant context:\n\n',
      memoryFormat: '- [{{type}}] {{content}}',
      separator: '\n',
      footer: '\n',
      includeMetadata: false
    })
  }
}
```

#### LLM Coordinator

```typescript
class LLMCoordinator {
  constructor(config: LLMConfig)
  
  // Complete prompt with LLM
  async complete(prompt: string): Promise<string>
  
  // Parse LLM response to structured format
  parseResponse(response: string): LLMResponse
}

interface LLMConfig {
  provider: 'openai' | 'anthropic'
  apiKey: string
  model: string
  temperature: number
}

interface LLMResponse {
  assistant_text: string
  actions: Action[]
}
```

**Implementation Notes**:
- For MVP, use OpenAI GPT-4 or GPT-3.5-turbo with `response_format: { type: "json_object" }`
- Always validate parsed response structure before returning:
  - `assistant_text` must be string
  - `actions` must be array
  - Only known action types allowed (`file.open`, `info.recall`)
- If validation fails, return safe fallback:
  ```typescript
  {
    assistant_text: "I didn't understand that well enough to act.",
    actions: [],
    memories_used: []
  }
  ```
- Include retry logic for rate limits
- Use regex fallback if JSON parsing fails

#### File Indexer

```typescript
class FileIndexer {
  constructor(memoryManager: MemoryManager)
  
  // Index files from daemon request
  async indexFiles(
    request: FileIndexRequest,
    workspaceId: string
  ): Promise<Result<void, IndexError>>
}

interface FileIndexRequest {
  user_id: string
  files: FileMetadata[]
}

type IndexError =
  | { type: 'storage_error'; message: string }
  | { type: 'validation_error'; message: string }
```

### Ghost Dashboard

#### Dashboard API

```typescript
// GET /api/dashboard/commands?limit=50
interface DashboardData {
  commands: CommandEntry[]
  stats: DashboardStats
}

interface CommandEntry {
  id: string
  text: string
  assistant_text: string
  timestamp: string
  actions: ActionResult[]
  memories_used: MemoryReference[]
}

interface DashboardStats {
  totalCommands: number
  totalMemories: number
  successRate: number
}
```

#### Dashboard Components

**CommandList Component**:
```typescript
function CommandList({ commands }: { commands: CommandEntry[] }) {
  return (
    <div className="command-list">
      {commands.map(cmd => (
        <div key={cmd.id} className="command-entry">
          <div className="command-text">
            <strong>User:</strong> {cmd.text}
          </div>
          <div className="assistant-text">
            <strong>Ghost:</strong> {cmd.assistant_text}
          </div>
          <div className="metadata">
            <span>{new Date(cmd.timestamp).toLocaleString()}</span>
            <span>{cmd.actions.length} actions</span>
            <span>{cmd.memories_used.length} memories</span>
          </div>
          <ActionStatus actions={cmd.actions} />
          <MemoryList memories={cmd.memories_used} />
        </div>
      ))}
    </div>
  )
}
```

**MemoryCard Component**:
```typescript
function MemoryCard({ memory }: { memory: MemoryReference }) {
  return (
    <div className="memory-card">
      <div className="memory-type">{memory.type}</div>
      <div className="memory-content">{memory.summary}</div>
      <div className="memory-score">
        Relevance: {(memory.score * 100).toFixed(0)}%
      </div>
    </div>
  )
}
```

## Data Flow

### Complete Command Flow

```
1. User presses Alt+Space
   ↓
2. Daemon plays chime, starts recording
   ↓
3. User speaks: "Hey Ghost, open the report from yesterday"
   ↓
4. Daemon detects silence, stops recording
   ↓
5. Daemon sends audio to Whisper API → transcript
   ↓
6. Daemon strips "Hey Ghost" prefix
   ↓
7. Daemon sends to Backend: POST /api/command
   {
     "text": "open the report from yesterday",
     "user_id": "user-123",
     ...
   }
   ↓
8. Backend stores as conversation turn
   ↓
9. Backend queries MemoryLayer:
   - Search for "report" + "yesterday"
   - Find file entity: "Q4_Sales_Report.pdf" (modified yesterday)
   ↓
10. Backend builds LLM prompt with context
   ↓
11. LLM responds:
   {
     "assistant_text": "Opening Q4 Sales Report from yesterday.",
     "actions": [
       { "type": "file.open", "params": { "path": "/Users/you/Documents/Q4_Sales_Report.pdf" } }
     ]
   }
   ↓
12. Backend returns response to Daemon
   ↓
13. Daemon speaks: "Opening Q4 Sales Report from yesterday."
   ↓
14. Daemon executes: open /Users/you/Documents/Q4_Sales_Report.pdf
   ↓
15. File opens in default app
   ↓
16. Backend (async) extracts memories from conversation
   ↓
17. Dashboard polls and shows new command entry
```

## Configuration

### Daemon Configuration

```json
{
  "backend": {
    "url": "http://localhost:3000",
    "apiKey": "ghost-api-key-123"
  },
  "user": {
    "id": "user-123",
    "workspace_id": "workspace-456"
  },
  "privacy": {
    "mode": "local-preferred",
    "redact_emails_in_prompts": true,
    "redact_file_paths_in_prompts": true,
    "max_prompt_history_days": 30
  },
  "voice": {
    "sttProvider": "openai",
    "sttApiKey": "sk-...",
    "ttsProvider": "system",
    "hotkey": "Alt+Space",
    "silenceThreshold": 2.0,
    "maxRecordingDuration": 30
  },
  "files": {
    "scanDirectories": [
      "~/Documents",
      "~/Desktop"
    ],
    "includeExtensions": [".pdf", ".docx", ".txt", ".md", ".pptx"]
  }
}
```

**Privacy Modes**:
- `local-only`: Require local STT/LLM/embeddings; fail fast if not available
- `local-preferred`: Try local models, fall back to cloud with warning
- `cloud-ok`: Default for MVP, uses cloud providers

### Backend Configuration

```env
# Server
PORT=3000
NODE_ENV=development

# Database (Storage Layer)
DATABASE_URL=postgresql://user:pass@localhost:5432/ghost

# LLM
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4
LLM_TEMPERATURE=0.7

# Embeddings
EMBEDDING_MODEL=text-embedding-3-small

# Auth
API_KEY=ghost-api-key-123

# Memory Extraction
MEMORY_EXTRACTION_ENABLED=true
MEMORY_EXTRACTION_ASYNC=true
```

## Error Handling Strategy

### Daemon Errors (Priority for MVP)

**High Priority**:
- **STT failed**: Show "Didn't catch that, try again" notification
- **Backend unreachable**: Toast "Ghost is offline"
- **File not found**: Speak "I couldn't find that file anymore"

**Lower Priority** (log and continue):
- Microphone access denied
- TTS failure (fall back to notification)
- Action execution errors (log, continue with next action)

### Backend Errors (Priority for MVP)

**High Priority**:
- **LLM error**: Return safe fallback response with empty actions
- **Context error**: Call LLM with empty context instead of failing
- **JSON parse error**: Use regex fallback or return safe default

**Lower Priority** (log and continue):
- Storage failures (return partial response)
- Memory extraction failures (async, don't block)
- Invalid actions (skip, continue)

### Graceful Degradation

- If context retrieval fails → proceed with empty context
- If memory extraction fails → log error, continue
- If TTS fails → show notification instead
- If action fails → log error, continue with next action

## Testing Strategy

### Daemon Tests

- Unit tests for voice pipeline (mock STT)
- Unit tests for action executor (mock file system)
- Integration tests for API client (mock backend)
- Manual tests for hotkey and TTS

### Backend Tests

- Unit tests for command processor (mock dependencies)
- Unit tests for LLM coordinator (mock LLM API)
- Integration tests with real Storage Layer
- Integration tests with real MemoryLayer components
- End-to-end tests with mock daemon requests

### Demo Scenario Tests

Create automated tests for the 3 target scenarios:

1. **File Recall**: "open the report from yesterday"
   - Pre-seed file memories
   - Verify correct file is identified
   - Verify file.open action is returned

2. **Info Recall**: "what do I know about ACME Q4 launch?"
   - Pre-seed fact memories about ACME
   - Verify relevant memories are retrieved
   - Verify info.recall action with summary

3. **Context-Aware**: "show me the presentation for Sarah's meeting"
   - Pre-seed file + person entities
   - Verify both entities are used in context
   - Verify correct file is identified

## Design Risks & Mitigations

### Scope Risk (14-Day Timeline)

**Risk**: The current stack includes many moving pieces (Electron, Backend API, Postgres, MemoryLayer, LLM, Dashboard, Voice, TTS, File Scanner).

**Mitigations**:
- Don't overbuild renderer UI in Daemon – tray + config.json is sufficient
- Don't overbuild Dashboard – transcript + memories + actions only, no fancy filtering
- File indexing: on-demand scan once, not live monitoring
- Use system TTS (free, fast, no API) instead of premium TTS
- Focus on 2-3 bulletproof demo scenarios, not comprehensive coverage

### LLM JSON Reliability

**Risk**: Prompt-based JSON parsing will fail during demos without proper safeguards.

**Mitigations**:
- Use OpenAI's `response_format: { type: "json_object" }` for guaranteed JSON
- Validate response structure before returning to Daemon
- Implement safe fallback for malformed responses
- Test with edge cases (ambiguous commands, missing context)

### Cross-Platform File Operations

**Risk**: File path handling and command execution varies across macOS/Windows/Linux.

**Mitigations**:
- Use `execFile` instead of `exec` to prevent shell injection
- Properly escape paths with spaces and special characters
- Validate paths before execution (prevent traversal)
- Test on target platform early

### File Indexing Complexity

**Risk**: Scanning large directory trees can be slow and resource-intensive.

**Mitigations**:
- Limit scan depth (default: 3 levels)
- Limit file count (default: 1000 files max)
- Exclude common large directories (node_modules, .git)
- Make scanning on-demand, not automatic
- Show progress indicator during scan

## MVP Scope Summary

### Must Have (P0)

- ✅ Hotkey activation (Alt+Space)
- ✅ Voice recording with silence detection
- ✅ STT via OpenAI Whisper
- ✅ TTS via system TTS
- ✅ Backend command processing
- ✅ Memory extraction (async)
- ✅ Context retrieval from MemoryLayer
- ✅ LLM coordination (GPT-4)
- ✅ file.open action
- ✅ info.recall action
- ✅ File pre-indexing (on-demand scan)
- ✅ Simple dashboard (command list + memories)
- ✅ API key authentication

### Nice to Have (P1)

- Email drafting (mailto: link)
- System tray icon with menu
- Dashboard filtering
- Retry queue for failed commands
- Better error messages

### Future (P2)

- Continuous wake phrase detection
- Live file monitoring
- Multi-user support
- Advanced dashboard analytics
- Custom action plugins

## Deployment

### Daemon Distribution

- Package as Electron app for macOS/Windows/Linux
- Include config.example.json
- Provide setup instructions for backend URL and API key

### Backend Deployment

- Deploy to any Node.js hosting (Vercel, Railway, Fly.io)
- Requires Postgres database (Supabase, Neon, etc.)
- Set environment variables for API keys
- Run migrations from Storage Layer

### Dashboard Deployment

- Build static site (Vite/Next.js)
- Deploy to Vercel/Netlify
- Configure API URL to backend

## Privacy & Data Residency

Ghost is designed so that core memory and actions can run locally, with optional use of cloud AI providers.

### Data Categories

**Local-only data**:
- File contents on disk
- File system operations (file.open)
- System notifications and TTS playback
- Ghost Daemon configuration
- (When backend is run on the same machine) conversations and memories in Postgres

**Cloud-processed data (MVP)**:
- Audio segments sent to the STT provider (e.g. OpenAI Whisper) to obtain transcripts
- Command text and selected memory snippets sent to the LLM provider for reasoning
- Memory text sent to an embedding provider when embeddings are generated (if using a cloud embedding model)

**Important**: Ghost does not upload file contents by default, only file metadata (name, path, size, timestamps) for recall.

### Local vs Remote Backend

The Backend API and Postgres storage can be deployed either:
- **Locally** on the same machine (e.g. `http://localhost:3000`) – fully local memory
- **Remotely** (e.g. managed hosting) – centralized memory for multiple devices

For security-sensitive use, the recommended deployment is **local backend + local database**, so all long-term memory stays on the user's device.

### Prompt Redaction

Before sending any text to an external LLM or embedding provider, the Backend SHALL:

1. **Redact obvious PII when configured**:
   - Email addresses → `user+hash@example.com` or `Person#1`
   - Absolute file paths → basename only or `[/path/redacted]/file.ext`

2. **Limit context window** to relevant memories from the last `max_prompt_history_days` (configurable), to avoid oversharing long-term history

3. **Exclude raw file contents** unless explicitly enabled for a given action (e.g. "summarize this file" in future versions)

These redaction behaviors are controlled via the Daemon's privacy configuration and can be disabled for development.

**Implementation**:
```typescript
function redactPII(text: string, config: PrivacyConfig): string {
  if (!config.redact_emails_in_prompts && !config.redact_file_paths_in_prompts) {
    return text
  }
  
  let redacted = text
  
  if (config.redact_emails_in_prompts) {
    // Redact email addresses
    redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 
      (email) => `Person#${hashEmail(email)}`)
  }
  
  if (config.redact_file_paths_in_prompts) {
    // Redact absolute paths, keep basename
    redacted = redacted.replace(/(?:\/[\w.-]+)+\/[\w.-]+/g, 
      (path) => `[/path/redacted]/${path.split('/').pop()}`)
    redacted = redacted.replace(/[A-Z]:\\(?:[\w.-]+\\)*[\w.-]+/g, 
      (path) => `[C:\\path\\redacted]\\${path.split('\\').pop()}`)
  }
  
  return redacted
}
```

### Logging & Retention

**Ghost SHALL avoid logging sensitive payloads by default**:
- Logs MAY include high-level event info (timestamps, error types, action types)
- Logs SHALL NOT include full command text, memory content, or raw LLM prompts/responses in production mode
- Ghost SHALL support a "debug mode" where full prompts/responses can be logged for development, clearly marked and disabled by default

**The Backend SHALL provide a simple retention policy**:
- Old raw conversations MAY be pruned or summarized after a configurable period (e.g. 90 days)
- Compact structured memories are kept for long-term operation

## Security Considerations

- API key authentication for all backend endpoints
- Validate all file paths before execution (prevent path traversal)
- Sanitize LLM responses before execution
- Don't log sensitive data (API keys, file contents)
- Use HTTPS for all backend communication
- Store API keys securely in daemon config (encrypted if possible)

### Model Provider Trust Boundary

Ghost relies on external AI providers (STT, LLM, embeddings) in MVP mode. These providers are treated as part of the trusted compute boundary: they receive audio and/or text content needed to fulfill user commands. For deployments that require strict data residency, Ghost can be configured to use self-hosted or on-device models instead, in which case no audio or memory content leaves the user's machine.

## Performance Targets

- Voice recording → transcript: < 3 seconds
- Command → response: < 5 seconds
- TTS playback: immediate start
- File indexing: < 10 seconds for 1000 files
- Dashboard load: < 2 seconds
- Memory extraction: < 30 seconds (async, doesn't block)

## Future Enhancements

- Wake phrase detection (always listening)
- Email integration (Gmail API)
- Calendar integration
- Task management
- Multi-modal input (text + voice)
- Custom action plugins
- Voice customization
- Conversation history search
- Memory editing/deletion
- Export conversations
