# Requirements Document - Ghost MVP (14-Day Hackathon)

## Introduction

Ghost is a voice-activated AI assistant daemon that runs locally on the user's machine, providing an "AI OS" experience. It combines voice interaction with MemoryLayer's context engine to enable natural, memory-aware commands. The system consists of two components: a Ghost Daemon (always-on local agent) and a Ghost Dashboard (web interface for visualization and debugging).

**MVP Scope:** This spec focuses on P0 (must-have) requirements only, designed to be built in 14 days for hackathon demonstration. The goal is to deliver 2-3 bulletproof demo scenarios that showcase MemoryLayer's power.

## Glossary

- **Ghost Daemon**: The local desktop application that handles voice input, command processing, and local action execution
- **Ghost Dashboard**: The web-based interface that visualizes command history, memory usage, and system activity
- **Hotkey**: The keyboard shortcut (Alt+Space) that activates the voice listener
- **Command**: A voice utterance from the user after hotkey activation
- **MemoryLayer**: The existing memory extraction and context retrieval system
- **Action**: A concrete operation the system can perform (open file, recall information)
- **Memory Context**: The set of relevant memories retrieved to inform command interpretation
- **Backend API**: The server that processes commands, manages MemoryLayer, and coordinates with LLM

## Requirements (P0 - MVP Only)

### Requirement 1: Hotkey Voice Activation

**User Story:** As a user, I want to activate Ghost using a hotkey, so that I can give voice commands without typing.

#### Acceptance Criteria

1. WHEN the user presses Alt+Space, THE Ghost Daemon SHALL activate the voice listener and play an audible chime
2. WHILE the voice listener is active, THE Ghost Daemon SHALL capture audio from the default microphone
3. WHEN the user finishes speaking (after 2 seconds of silence), THE Ghost Daemon SHALL stop recording and send audio to speech-to-text service
4. THE Ghost Daemon SHALL display a minimal visual indicator showing recording status
5. IF the transcribed text starts with "Hey Ghost", THEN THE Ghost Daemon SHALL strip that prefix before processing the command

### Requirement 2: Command Processing

**User Story:** As a user, I want Ghost to understand my natural language commands using memory context, so that I can give vague instructions like "send Sarah the report from yesterday."

#### Acceptance Criteria

1. WHEN a command is captured, THE Ghost Daemon SHALL send the command text to the Backend API with user identification
2. THE Backend API SHALL store the command as a conversation turn in MemoryLayer storage
3. THE Backend API SHALL query MemoryLayer for relevant context based on entities, timestamps, and semantic similarity in the command
4. THE Backend API SHALL construct an LLM prompt containing the command text and retrieved memory context
5. THE Backend API SHALL return a response containing assistant text, actions to execute, and memories used

### Requirement 3: Memory Integration (Simplified)

**User Story:** As a user, I want Ghost to remember my past interactions and files, so that it can interpret context-dependent commands correctly.

#### Acceptance Criteria

1. THE Backend API SHALL run memory extraction on all command-response pairs to create entities and facts
2. WHEN a command references temporal information (yesterday, last week), THE Backend API SHALL filter memories using simple timestamp heuristics (yesterday = last 24 hours)
3. WHEN a command references people or files, THE Backend API SHALL search for matching entity memories by name or semantic similarity
4. THE Backend API SHALL rank retrieved memories by recency and relevance score before including them in LLM context
5. THE Backend API SHALL store action outcomes as new entity memories for future reference

### Requirement 4: Local Action Execution (Core Actions Only)

**User Story:** As a user, I want Ghost to perform actions on my machine like opening files or recalling information, so that I can accomplish tasks through voice commands.

#### Acceptance Criteria

1. WHEN the Backend API returns a "file.open" action, THE Ghost Daemon SHALL open the specified file using the system default application (open/xdg-open/start)
2. WHEN the Backend API returns an "info.recall" action, THE Ghost Daemon SHALL display the information summary in a system notification
3. THE Ghost Daemon SHALL execute actions in the order specified by the Backend API response
4. IF an action fails to execute, THEN THE Ghost Daemon SHALL log the error and continue with remaining actions
5. THE Ghost Daemon SHALL send action execution status back to the Backend API for logging

### Requirement 5: Voice Response

**User Story:** As a user, I want Ghost to speak responses out loud, so that I can receive feedback without looking at a screen.

#### Acceptance Criteria

1. WHEN the Backend API returns assistant text, THE Ghost Daemon SHALL convert the text to speech using the system TTS engine
2. THE Ghost Daemon SHALL play the synthesized speech through the default audio output device
3. WHILE speech is playing, THE Ghost Daemon SHALL display a minimal visual indicator showing Ghost is speaking
4. THE Ghost Daemon SHALL allow the user to interrupt speech playback with a hotkey or wake phrase
5. WHERE TTS is unavailable, THE Ghost Daemon SHALL display the response text in a notification

### Requirement 6: Dashboard Visualization (Minimal)

**User Story:** As a developer or demo viewer, I want to see a visual representation of Ghost's activity, so that I can understand how MemoryLayer is being used.

#### Acceptance Criteria

1. THE Ghost Dashboard SHALL display a chronological transcript of all commands and responses
2. THE Ghost Dashboard SHALL show which memories were retrieved for each command with type, snippet, and relevance score
3. THE Ghost Dashboard SHALL display which actions were executed for each command with status indicators (success/failure)
4. THE Ghost Dashboard SHALL update via polling every 2 seconds to show new commands
5. THE Ghost Dashboard SHALL be accessible via a simple web interface served by the Backend API

### Requirement 7: File Memory Pre-Indexing

**User Story:** As a user, I want Ghost to know about files in my workspace, so that I can reference them by description rather than exact filename.

#### Acceptance Criteria

1. THE Ghost Daemon SHALL provide a command to scan specified directories (Documents, Desktop) for files
2. WHEN scanning is triggered, THE Ghost Daemon SHALL send file metadata (path, name, modified time) to the Backend API
3. THE Backend API SHALL create entity memories for files with attributes: path, name, last_modified
4. WHEN a command references file descriptions, THE Backend API SHALL search file entity memories by name match and semantic similarity
5. THE Backend API SHALL prioritize recently modified files when multiple matches exist

### Requirement 8: Basic Error Handling

**User Story:** As a user, I want Ghost to handle errors gracefully, so that temporary failures don't break my workflow.

#### Acceptance Criteria

1. IF the Backend API is unreachable, THEN THE Ghost Daemon SHALL display an error notification with the error message
2. IF speech-to-text fails, THEN THE Ghost Daemon SHALL display a notification asking the user to try again
3. IF no relevant memories are found, THEN THE Backend API SHALL still process the command with available context
4. THE Ghost Daemon SHALL log all errors to console for debugging purposes
5. THE Backend API SHALL return error messages in the response when command processing fails

### Requirement 9: Simple Configuration

**User Story:** As a user, I want to configure Ghost's backend connection, so that the daemon can communicate with my API.

#### Acceptance Criteria

1. THE Ghost Daemon SHALL read configuration from a local JSON file (config.json) containing backend URL and API key
2. THE Ghost Daemon SHALL use environment variables as fallback if config file is not present
3. THE Ghost Daemon SHALL validate backend connectivity on startup and display status
4. THE Backend API SHALL accept API key authentication for all command endpoints
5. THE Ghost Daemon SHALL store user_id in configuration for associating commands with users


## API Contract

### Command Request (Daemon → Backend)

```
POST /api/command
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "user_id": "user-123",
  "command_id": "uuid-1",
  "text": "send Sarah the report from yesterday",
  "timestamp": "2025-11-22T15:34:12Z",
  "meta": {
    "source": "voice",
    "client_version": "0.1.0"
  }
}
```

### Command Response (Backend → Daemon)

```
{
  "command_id": "uuid-1",
  "assistant_text": "I found Q4_Sales_Report.pdf from yesterday. Opening it now.",
  "actions": [
    {
      "type": "file.open",
      "params": {
        "path": "/Users/you/Documents/Q4_Sales_Report.pdf"
      }
    }
  ],
  "memories_used": [
    {
      "id": "mem-123",
      "type": "entity.file",
      "score": 0.92,
      "summary": "Q4_Sales_Report.pdf, last modified yesterday 3pm"
    },
    {
      "id": "mem-456",
      "type": "entity.person",
      "score": 0.88,
      "summary": "Sarah - sarah@company.com"
    }
  ]
}
```

### Action Types

- **file.open**: Opens a file with system default application
  - params: `{ "path": "/absolute/path/to/file" }`
  
- **info.recall**: Displays information summary
  - params: `{ "summary": "text to display" }`

### File Index Request (Daemon → Backend)

```
POST /api/files/index
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "user_id": "user-123",
  "files": [
    {
      "path": "/Users/you/Documents/Q4_Sales_Report.pdf",
      "name": "Q4_Sales_Report.pdf",
      "modified": "2025-11-21T15:30:00Z"
    }
  ]
}
```

## Demo Scenarios (Target)

These are the 2-3 bulletproof scenarios to showcase for the hackathon:

1. **File Recall by Description**
   - User: "Hey Ghost, open the report I was working on yesterday"
   - Ghost: Finds Q4_Sales_Report.pdf from file memories, opens it, speaks confirmation

2. **Information Recall**
   - User: "Hey Ghost, what do I know about the ACME Q4 launch?"
   - Ghost: Searches memories, summarizes findings, speaks summary

3. **Context-Aware File + Person**
   - User: "Hey Ghost, show me the presentation for Sarah's meeting"
   - Ghost: Finds presentation file associated with Sarah entity, opens it

## Out of Scope (P1/P2 - Future)

- Continuous wake phrase detection (background listening)
- Email drafting and sending
- System tray icon and menu
- Live file system monitoring
- Advanced dashboard filtering
- Setup wizard UI
- Action retry and queuing
- Multi-user support
- Task extraction and management
