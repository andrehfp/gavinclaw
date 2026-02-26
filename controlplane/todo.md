# TODO

## Core Chat
- [x] Connect to LLMs
- [x] Stream responses
- [x] Tool calling
- [ ] Thinking streaming
      - [ ] Backend: stream reasoning only for reasoning-capable models
      - [ ] Frontend: keep reasoning collapsed by default while still showing live indicator
      - [ ] Keep reasoning persisted in message parts but excluded from copy/export actions
      - [ ] Add tests for model reasoning capability + text-copy regression
      - [ ] Validate UX on one reasoning model and one non-reasoning model
- [x] Copy response from the assistant
- [x] Copy code block only

## Model Management
- [x] Picker to choose models from

## Files & Media
- [x] Attach files and images

## Workspace / Projects
- [x] Create projects/folders to create chats in them

## Safety & Governance
- [ ] Governance layer

## Admin & Operations
- [ ] Admin Pannel
- [ ] Debug Pannel
- [ ] Analytics Pannel

- [x] Allow pasting images and files directly into the chat with Ctrl/Cmd + V (without needing to click "attach")
- [x] Fork and continue the conversation in another thread
- [ ] Tool creation and management in the admin dashboard

- [x] add cost in the database (real cost for each query, not estimation)
- [x] Allow pinning conversations to the top of conversation lists
- [ ] Allow moving/reordering conversations within and between folders/projects
- [x] Keyboard shortcuts
      - [x] `Cmd/Ctrl + K` opens command palette
      - [x] `Shift + N` creates a new chat
      - [x] `Shift + P` creates a new project
      - [x] `Shift + T` toggles light/dark mode
      - [x] `?` opens keyboard shortcuts help
      - [x] Ignore shortcuts while typing in inputs/textareas/contenteditable
      - [x] Add cross-platform labels (`Cmd` on macOS, `Ctrl` on Windows/Linux)

- [ ] Create and add favicon
- [ ] Per-project context:
      - Allow adding a custom prompt and reference files to each project
      - All chats within a project automatically have access to the project's prompt and files as shared context
      - UI for managing the project prompt and files
