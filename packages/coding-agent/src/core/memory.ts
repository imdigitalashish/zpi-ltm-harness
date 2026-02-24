/**
 * Persistent memory system — procedural, episodic, and semantic memories
 * stored per-project in .pi/memory/ or globally in ~/.pi/agent/memory/ as JSON files.
 * Scope is configured via settings (memory.scope: "project" | "global")
 * or overridden per-project via a .zpi config file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProceduralMemory {
	id: string;
	name: string;
	trigger: string;
	steps: string[];
	tags: string[];
	created: string;
	updated: string;
	sourceSession: string;
}

export interface EpisodicMemory {
	id: string;
	summary: string;
	details: string[];
	reflection?: {
		mistakes: string[];
		lessons: string[];
	};
	tags: string[];
	date: string;
	sourceSession: string;
}

export interface SemanticMemory {
	id: string;
	category: "preference" | "architecture" | "convention" | "fact";
	text: string;
	tags: string[];
	created: string;
	sourceSession: string;
}

export interface MemoryStore<T> {
	memories: T[];
}

export type MemoryType = "procedural" | "episodic" | "semantic";
export type MemoryScope = "project" | "global";

// ---------------------------------------------------------------------------
// .zpi config file
// ---------------------------------------------------------------------------

export interface ZpiConfig {
	memory?: {
		scope?: MemoryScope;
	};
}

/**
 * Read .zpi config file from the project root.
 * Returns undefined if file doesn't exist or is invalid.
 */
export function readZpiConfig(cwd: string): ZpiConfig | undefined {
	const configPath = join(cwd, ".zpi");
	if (!existsSync(configPath)) {
		return undefined;
	}
	try {
		const raw = readFileSync(configPath, "utf-8");
		return JSON.parse(raw) as ZpiConfig;
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Get the global memory directory (~/.pi/agent/memory/) */
export function getGlobalMemoryDir(): string {
	return join(homedir(), CONFIG_DIR_NAME, "agent", "memory");
}

/** Get the project memory directory (<cwd>/.pi/memory/) */
export function getProjectMemoryDir(cwd: string): string {
	return join(cwd, CONFIG_DIR_NAME, "memory");
}

/**
 * Resolve the effective memory scope for a project.
 * Priority: .zpi config > settings > default ("project")
 */
export function resolveMemoryScope(cwd: string, settingsScope: MemoryScope): MemoryScope {
	const zpiConfig = readZpiConfig(cwd);
	if (zpiConfig?.memory?.scope) {
		return zpiConfig.memory.scope;
	}
	return settingsScope;
}

/**
 * Get the memory directory based on scope.
 */
export function getMemoryDir(cwd: string, scope: MemoryScope = "global"): string {
	if (scope === "global") {
		return getGlobalMemoryDir();
	}
	return getProjectMemoryDir(cwd);
}

function ensureMemoryDir(cwd: string, scope: MemoryScope = "global"): string {
	const dir = getMemoryDir(cwd, scope);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	return dir;
}

export function loadStore<T>(cwd: string, filename: string, scope: MemoryScope = "global"): MemoryStore<T> {
	const filepath = join(getMemoryDir(cwd, scope), filename);
	if (!existsSync(filepath)) {
		return { memories: [] };
	}
	try {
		const raw = readFileSync(filepath, "utf-8");
		return JSON.parse(raw) as MemoryStore<T>;
	} catch {
		return { memories: [] };
	}
}

export function saveStore<T>(cwd: string, filename: string, store: MemoryStore<T>, scope: MemoryScope = "global"): void {
	const dir = ensureMemoryDir(cwd, scope);
	const filepath = join(dir, filename);
	writeFileSync(filepath, JSON.stringify(store, null, 2), "utf-8");
}

export function generateId(prefix: string, store: MemoryStore<{ id: string }>): string {
	let max = 0;
	for (const m of store.memories) {
		const num = parseInt(m.id.replace(`${prefix}_`, ""), 10);
		if (!Number.isNaN(num) && num > max) max = num;
	}
	return `${prefix}_${String(max + 1).padStart(3, "0")}`;
}

export function nowISO(): string {
	return new Date().toISOString();
}

export function getSessionId(): string {
	return `session_${Date.now()}`;
}

const STORE_FILES: Record<MemoryType, string> = {
	procedural: "procedural.json",
	episodic: "episodic.json",
	semantic: "semantic.json",
};

export function getStoreFile(type: MemoryType): string {
	return STORE_FILES[type];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function searchMemories<T extends { tags: string[] }>(
	memories: T[],
	query: string,
	getText: (m: T) => string,
): T[] {
	const lower = query.toLowerCase();
	const queryWords = lower.split(/\s+/).filter(Boolean);
	return memories.filter((m) => {
		const text = getText(m).toLowerCase();
		const tagText = m.tags.join(" ").toLowerCase();
		const combined = `${text} ${tagText}`;
		return queryWords.every((w) => combined.includes(w));
	});
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

export function compactEpisodicMemories(memories: EpisodicMemory[]): EpisodicMemory[] {
	if (memories.length <= 1) return memories;

	const tagGroups = new Map<string, EpisodicMemory[]>();
	for (const m of memories) {
		let placed = false;
		for (const [key, group] of tagGroups) {
			const groupTags = new Set(key.split(","));
			if (m.tags.some((t) => groupTags.has(t))) {
				group.push(m);
				const mergedTags = new Set([...groupTags, ...m.tags]);
				tagGroups.delete(key);
				tagGroups.set([...mergedTags].join(","), group);
				placed = true;
				break;
			}
		}
		if (!placed) {
			tagGroups.set(m.tags.join(",") || m.id, [m]);
		}
	}

	const compacted: EpisodicMemory[] = [];
	for (const [, group] of tagGroups) {
		if (group.length <= 1) {
			compacted.push(...group);
			continue;
		}
		const allDetails = group.flatMap((m) => m.details);
		const allTags = [...new Set(group.flatMap((m) => m.tags))];
		const allMistakes = group.flatMap((m) => m.reflection?.mistakes ?? []);
		const allLessons = group.flatMap((m) => m.reflection?.lessons ?? []);
		const summaries = group.map((m) => m.summary);

		compacted.push({
			id: group[0].id,
			summary: `Consolidated: ${summaries.join("; ")}`,
			details: [...new Set(allDetails)],
			reflection:
				allMistakes.length > 0 || allLessons.length > 0
					? { mistakes: [...new Set(allMistakes)], lessons: [...new Set(allLessons)] }
					: undefined,
			tags: allTags,
			date: group[group.length - 1].date,
			sourceSession: group[group.length - 1].sourceSession,
		});
	}
	return compacted;
}

// ---------------------------------------------------------------------------
// Display formatters
// ---------------------------------------------------------------------------

export function formatProceduralForDisplay(m: ProceduralMemory): string {
	const steps = m.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
	return `[${m.id}] ${m.name}\n  Trigger: ${m.trigger}\n  Tags: ${m.tags.join(", ")}\n  Steps:\n${steps}\n  Updated: ${m.updated}`;
}

export function formatEpisodicForDisplay(m: EpisodicMemory): string {
	let text = `[${m.id}] ${m.summary}\n  Date: ${m.date}\n  Tags: ${m.tags.join(", ")}`;
	if (m.details.length > 0) {
		text += `\n  Details:\n${m.details.map((d) => `    - ${d}`).join("\n")}`;
	}
	if (m.reflection) {
		if (m.reflection.mistakes.length > 0) {
			text += `\n  Mistakes:\n${m.reflection.mistakes.map((x) => `    - ${x}`).join("\n")}`;
		}
		if (m.reflection.lessons.length > 0) {
			text += `\n  Lessons:\n${m.reflection.lessons.map((x) => `    - ${x}`).join("\n")}`;
		}
	}
	return text;
}

export function formatSemanticForDisplay(m: SemanticMemory): string {
	return `[${m.id}] (${m.category}) ${m.text}\n  Tags: ${m.tags.join(", ")}\n  Created: ${m.created}`;
}

// ---------------------------------------------------------------------------
// System prompt section
// ---------------------------------------------------------------------------

export function buildMemoryPromptSection(cwd: string, scope: MemoryScope = "global"): string {
	const semantic = loadStore<SemanticMemory>(cwd, "semantic.json", scope);
	const procedural = loadStore<ProceduralMemory>(cwd, "procedural.json", scope);
	const episodic = loadStore<EpisodicMemory>(cwd, "episodic.json", scope);

	if (semantic.memories.length === 0 && procedural.memories.length === 0 && episodic.memories.length === 0) {
		return `\n\n<memory_system>
You have a persistent memory system that stores knowledge across sessions.
Currently no memories are stored. Use the memory_write tool to save:
1. Procedural memories when the user guides you through a multi-step workflow.
2. Semantic memories when the user states a preference, rule, correction, or fact.
3. Episodic memories when a significant task completes.
</memory_system>`;
	}

	const parts: string[] = [];

	parts.push(`\n\n<memory_system>
You have a persistent memory system that stores knowledge across sessions.
You MUST use these memories to improve your responses. Do not ask the user
to repeat things they have already taught you.

AUTOMATIC MEMORY CAPTURE RULES:
1. When the user guides you through a multi-step workflow (correcting steps,
   adding steps, reordering), save it as a PROCEDURAL memory using the
   memory_write tool. Extract the general workflow, not the specific instance.
2. When the user states a preference or rule ("always do X", "never do Y",
   "I prefer X"), save it as a SEMANTIC memory immediately.
3. When the user corrects you or you make a mistake, save the lesson as a
   SEMANTIC memory with category "convention".
4. When a significant task completes, save a summary as an EPISODIC memory.
5. If you detect a conflict with an existing memory, ask the user: "You
   previously told me [old]. You are now saying [new]. Should I update this?"
   Only update after confirmation.

TIMESTAMP AWARENESS:
Each user message includes a timestamp. Use these to detect time gaps.
If the user returns after a significant gap (>10 minutes), acknowledge it
naturally if relevant. Do not force it if the gap is not relevant.`);

	if (semantic.memories.length > 0) {
		parts.push("\n<semantic_memories>");
		for (const m of semantic.memories) {
			parts.push(`  <memory id="${m.id}" category="${m.category}">${escapeXml(m.text)}</memory>`);
		}
		parts.push("</semantic_memories>");
	}

	if (procedural.memories.length > 0) {
		parts.push("\n<procedural_memories>");
		for (const m of procedural.memories) {
			const steps = m.steps.map((s, i) => `${i + 1}. ${s}`).join("; ");
			parts.push(
				`  <procedure id="${m.id}" name="${escapeXml(m.name)}" trigger="${escapeXml(m.trigger)}">${escapeXml(steps)}</procedure>`,
			);
		}
		parts.push("</procedural_memories>");
	}

	if (episodic.memories.length > 0) {
		const recent = episodic.memories.slice(-10);
		parts.push("\n<recent_episodic_memories>");
		for (const m of recent) {
			const details = m.details.join("; ");
			let text = details;
			if (m.reflection?.lessons.length) {
				text += ` | Lessons: ${m.reflection.lessons.join("; ")}`;
			}
			parts.push(
				`  <episode id="${m.id}" date="${m.date}" summary="${escapeXml(m.summary)}">${escapeXml(text)}</episode>`,
			);
		}
		parts.push("</recent_episodic_memories>");
	}

	parts.push("\n</memory_system>");

	return parts.join("\n");
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

export function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

// ---------------------------------------------------------------------------
// Memory counts (for status display)
// ---------------------------------------------------------------------------

export interface MemoryCounts {
	semantic: number;
	procedural: number;
	episodic: number;
	total: number;
}

export function getMemoryCounts(cwd: string, scope: MemoryScope = "global"): MemoryCounts {
	const semantic = loadStore<SemanticMemory>(cwd, "semantic.json", scope).memories.length;
	const procedural = loadStore<ProceduralMemory>(cwd, "procedural.json", scope).memories.length;
	const episodic = loadStore<EpisodicMemory>(cwd, "episodic.json", scope).memories.length;
	return { semantic, procedural, episodic, total: semantic + procedural + episodic };
}
