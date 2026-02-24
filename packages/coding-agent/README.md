# zpi - Memory-Augmented Coding Agent

A terminal coding agent with persistent long-term memory that learns from your interactions across sessions.

## Install

```bash
npm install -g @imdigitalashish/zpi
```

## Setup

Authenticate with an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
zpi
```

Or use your existing subscription:

```bash
zpi
/login  # Then select provider
```

## Features

- **Persistent Memory System** — procedural, episodic, and semantic memories stored per-project in `.pi/memory/`
- **Automatic Learning** — the agent detects preferences, workflows, and facts from conversations and saves them automatically
- **Timestamp Awareness** — the LLM sees when each message was sent and can detect time gaps
- **Toggle On/Off** — memory system is on by default, disable via `/settings`

## Memory System

Memories are stored per-project in `.pi/memory/`:

| Type | File | What it stores |
|------|------|----------------|
| Procedural | `procedural.json` | Multi-step workflows the user teaches |
| Episodic | `episodic.json` | Session summaries, mistakes, lessons |
| Semantic | `semantic.json` | Preferences, rules, facts, conventions |

### Memory Tools (used by the LLM automatically)

- `memory_write` — save a new memory
- `memory_read` — recall memories by type, ID, or search
- `memory_update` — update an existing memory
- `memory_delete` — remove a memory

### Memory Commands

- `/memory` or `/memory list` — show all memories
- `/memory show <id>` — show a specific memory
- `/memory search <query>` — search memories
- `/memory delete <id>` — delete a memory
- `/memory compact` — deduplicate and consolidate memories

## Supported Providers

| Provider | Auth |
|----------|------|
| Anthropic | `ANTHROPIC_API_KEY` or `/login anthropic` |
| OpenAI | `OPENAI_API_KEY` |
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` or `/login google` |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` |
| GitHub Copilot | `/login copilot` |
| OpenAI-compatible | `OPENAI_API_KEY` + `OPENAI_BASE_URL` |

## Commands

| Command | Description |
|---------|-------------|
| `/model` | Switch model |
| `/login` | Authenticate with a provider |
| `/settings` | Toggle memory, theme, etc. |
| `/memory` | View/manage memories |
| `/sessions` | Browse sessions |
| `/compact` | Compact conversation |
| `/help` | Show all commands |

## Settings

Toggle memory system on/off:
- Use `/settings` in the TUI
- Or edit `.pi/settings.json`: `{ "memory": { "enabled": false } }`

## Author

[imdigitalashish](https://github.com/imdigitalashish)

## License

MIT
