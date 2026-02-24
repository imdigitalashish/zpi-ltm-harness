# zpi - Memory-Augmented Coding Agent

A coding agent with persistent long-term memory that learns from your interactions across sessions.

## Features

- **Persistent Memory System** — procedural, episodic, and semantic memories stored per-project in `.pi/memory/`
- **Automatic Learning** — the agent detects preferences, workflows, and facts from conversations and saves them automatically
- **Timestamp Awareness** — the LLM sees when each message was sent and can detect time gaps
- **Toggle On/Off** — memory system is on by default, disable via `/settings` or `{ "memory": { "enabled": false } }` in settings.json

## Installation

```bash
git clone https://github.com/imdigitalashish/zpi-ltm-harness.git
cd zpi-ltm-harness
npm install --ignore-scripts
cd packages/coding-agent
npm run build
npm link --force
```

Then run `zpi` from any project directory.

## Memory System

Memories are stored per-project in `.pi/memory/`:

| Type | File | What it stores |
|------|------|----------------|
| Procedural | `procedural.json` | Multi-step workflows the user teaches |
| Episodic | `episodic.json` | Session summaries, mistakes, lessons |
| Semantic | `semantic.json` | Preferences, rules, facts, conventions |

### Tools (used by the LLM automatically)

- `memory_write` — save a new memory
- `memory_read` — recall memories by type, ID, or search
- `memory_update` — update an existing memory
- `memory_delete` — remove a memory

### Commands

- `/memory` or `/memory list` — show all memories
- `/memory show <id>` — show a specific memory
- `/memory search <query>` — search memories
- `/memory delete <id>` — delete a memory
- `/memory compact` — deduplicate and consolidate memories

## Packages

| Package | Description |
|---------|-------------|
| **[packages/coding-agent](packages/coding-agent)** | The zpi coding agent CLI (`@imdigitalashish/zpi`) |
| **[packages/ai](packages/ai)** | Unified multi-provider LLM API |
| **[packages/agent](packages/agent)** | Agent runtime with tool calling |
| **[packages/tui](packages/tui)** | Terminal UI library |
| **[packages/web-ui](packages/web-ui)** | Web components for AI chat |

## Development

```bash
npm install --ignore-scripts
npm run build
```

To run from source without building:

```bash
npx tsx packages/coding-agent/src/cli.ts
```

## Credits

Forked from [pi-mono](https://github.com/badlogic/pi-mono) by [Mario Zechner](https://github.com/badlogic). Licensed under MIT.

## Author

[imdigitalashish](https://github.com/imdigitalashish)

## License

MIT
