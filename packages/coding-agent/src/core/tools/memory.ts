/**
 * Built-in memory tools: memory_write, memory_read, memory_update, memory_delete
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { StringEnum } from "@mariozechner/pi-ai";
import { type Static, Type } from "@sinclair/typebox";
import {
	type EpisodicMemory,
	formatEpisodicForDisplay,
	formatProceduralForDisplay,
	formatSemanticForDisplay,
	generateId,
	loadStore,
	type MemoryScope,
	nowISO,
	type ProceduralMemory,
	type SemanticMemory,
	saveStore,
	searchMemories,
} from "../memory.js";

export interface MemoryToolContext {
	cwd: string;
	sessionId: string;
	scope: MemoryScope;
}

let memoryContext: MemoryToolContext = { cwd: process.cwd(), sessionId: `session_${Date.now()}`, scope: "global" };

export function setMemoryToolContext(ctx: MemoryToolContext): void {
	memoryContext = ctx;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const memoryWriteSchema = Type.Object({
	type: StringEnum(["procedural", "episodic", "semantic"] as const),
	name: Type.Optional(Type.String({ description: "Name for procedural memories (e.g., 'deploy-service')" })),
	trigger: Type.Optional(
		Type.String({ description: "When to invoke this procedure (e.g., 'user asks to deploy a service')" }),
	),
	steps: Type.Optional(Type.Array(Type.String(), { description: "Steps for procedural memory" })),
	summary: Type.Optional(Type.String({ description: "Summary for episodic memory" })),
	details: Type.Optional(Type.Array(Type.String(), { description: "Details for episodic memory" })),
	category: Type.Optional(
		StringEnum(["preference", "architecture", "convention", "fact"] as const, {
			description: "Category for semantic memory",
		}),
	),
	text: Type.Optional(Type.String({ description: "Text content for semantic memory" })),
	tags: Type.Optional(Type.Array(Type.String(), { description: "Tags for searchability" })),
	reflection_mistakes: Type.Optional(
		Type.Array(Type.String(), { description: "Mistakes made (for episodic reflection)" }),
	),
	reflection_lessons: Type.Optional(
		Type.Array(Type.String(), { description: "Lessons learned (for episodic reflection)" }),
	),
});

type MemoryWriteInput = Static<typeof memoryWriteSchema>;

const memoryReadSchema = Type.Object({
	type: Type.Optional(StringEnum(["procedural", "episodic", "semantic", "all"] as const)),
	id: Type.Optional(Type.String({ description: "Specific memory ID to retrieve" })),
	query: Type.Optional(Type.String({ description: "Search query to find relevant memories" })),
});

type MemoryReadInput = Static<typeof memoryReadSchema>;

const memoryUpdateSchema = Type.Object({
	id: Type.String({ description: "Memory ID to update" }),
	text: Type.Optional(Type.String({ description: "New text (for semantic memories)" })),
	steps: Type.Optional(Type.Array(Type.String(), { description: "New steps (for procedural memories)" })),
	trigger: Type.Optional(Type.String({ description: "New trigger (for procedural memories)" })),
	tags: Type.Optional(Type.Array(Type.String(), { description: "Replace tags" })),
});

type MemoryUpdateInput = Static<typeof memoryUpdateSchema>;

const memoryDeleteSchema = Type.Object({
	id: Type.String({ description: "Memory ID to delete (e.g., 'proc_001', 'sem_003')" }),
});

type MemoryDeleteInput = Static<typeof memoryDeleteSchema>;

// ---------------------------------------------------------------------------
// memory_write
// ---------------------------------------------------------------------------

export const memoryWriteTool: AgentTool<typeof memoryWriteSchema> = {
	name: "memory_write",
	label: "Write Memory",
	description:
		"Save a memory to the persistent memory system. Use this automatically when: " +
		"(1) the user teaches you a multi-step workflow — save as 'procedural', " +
		"(2) the user states a preference, rule, or fact — save as 'semantic', " +
		"(3) a significant task completes — save as 'episodic'. " +
		"Do NOT ask the user for permission to save unless there is a conflict with an existing memory.",
	parameters: memoryWriteSchema,
	execute: async (_toolCallId: string, params: MemoryWriteInput) => {
		const { cwd, sessionId, scope } = memoryContext;
		const tags = params.tags ?? [];

		if (params.type === "procedural") {
			if (!params.name || !params.trigger || !params.steps?.length) {
				return {
					content: [{ type: "text", text: "Error: procedural memory requires name, trigger, and steps." }],
					details: {},
				};
			}
			const store = loadStore<ProceduralMemory>(cwd, "procedural.json", scope);
			const existing = store.memories.find((m) => m.name === params.name);
			if (existing) {
				existing.steps = params.steps;
				existing.trigger = params.trigger;
				existing.tags = [...new Set([...existing.tags, ...tags])];
				existing.updated = nowISO();
				saveStore(cwd, "procedural.json", store, scope);
				return {
					content: [{ type: "text", text: `Updated procedural memory [${existing.id}] "${params.name}".` }],
					details: { action: "updated", id: existing.id },
				};
			}
			const id = generateId("proc", store);
			store.memories.push({
				id,
				name: params.name,
				trigger: params.trigger,
				steps: params.steps,
				tags,
				created: nowISO(),
				updated: nowISO(),
				sourceSession: sessionId,
			});
			saveStore(cwd, "procedural.json", store, scope);
			return {
				content: [{ type: "text", text: `Saved procedural memory [${id}] "${params.name}".` }],
				details: { action: "created", id },
			};
		}

		if (params.type === "episodic") {
			if (!params.summary) {
				return {
					content: [{ type: "text", text: "Error: episodic memory requires a summary." }],
					details: {},
				};
			}
			const store = loadStore<EpisodicMemory>(cwd, "episodic.json", scope);
			const id = generateId("ep", store);
			const reflection =
				params.reflection_mistakes?.length || params.reflection_lessons?.length
					? { mistakes: params.reflection_mistakes ?? [], lessons: params.reflection_lessons ?? [] }
					: undefined;
			store.memories.push({
				id,
				summary: params.summary,
				details: params.details ?? [],
				reflection,
				tags,
				date: new Date().toISOString().split("T")[0],
				sourceSession: sessionId,
			});
			saveStore(cwd, "episodic.json", store, scope);
			return {
				content: [{ type: "text", text: `Saved episodic memory [${id}] "${params.summary}".` }],
				details: { action: "created", id },
			};
		}

		if (params.type === "semantic") {
			if (!params.text || !params.category) {
				return {
					content: [{ type: "text", text: "Error: semantic memory requires text and category." }],
					details: {},
				};
			}
			const store = loadStore<SemanticMemory>(cwd, "semantic.json", scope);
			const existing = store.memories.find(
				(m) => m.category === params.category && m.text.toLowerCase() === params.text!.toLowerCase(),
			);
			if (existing) {
				return {
					content: [{ type: "text", text: `This semantic memory already exists [${existing.id}].` }],
					details: { action: "duplicate", id: existing.id },
				};
			}
			const id = generateId("sem", store);
			store.memories.push({
				id,
				category: params.category,
				text: params.text,
				tags,
				created: nowISO(),
				sourceSession: sessionId,
			});
			saveStore(cwd, "semantic.json", store, scope);
			return {
				content: [{ type: "text", text: `Saved semantic memory [${id}] (${params.category}): "${params.text}".` }],
				details: { action: "created", id },
			};
		}

		return {
			content: [{ type: "text", text: `Unknown memory type: ${params.type}` }],
			details: {},
		};
	},
};

// ---------------------------------------------------------------------------
// memory_read
// ---------------------------------------------------------------------------

export const memoryReadTool: AgentTool<typeof memoryReadSchema> = {
	name: "memory_read",
	label: "Read Memory",
	description:
		"Read memories from the persistent memory system. Use this when you need to recall " +
		"past workflows, user preferences, or what happened in previous sessions. " +
		"You can read all memories of a type, a specific memory by ID, or search by query.",
	parameters: memoryReadSchema,
	execute: async (_toolCallId: string, params: MemoryReadInput) => {
		const { cwd, scope } = memoryContext;

		if (params.id) {
			const allStores: Array<{ file: string; format: (m: any) => string }> = [
				{ file: "procedural.json", format: formatProceduralForDisplay },
				{ file: "episodic.json", format: formatEpisodicForDisplay },
				{ file: "semantic.json", format: formatSemanticForDisplay },
			];
			for (const { file, format } of allStores) {
				const store = loadStore<{ id: string }>(cwd, file, scope);
				const found = store.memories.find((m) => m.id === params.id);
				if (found) {
					return {
						content: [{ type: "text", text: format(found) }],
						details: { found: true },
					};
				}
			}
			return {
				content: [{ type: "text", text: `No memory found with ID "${params.id}".` }],
				details: { found: false },
			};
		}

		if (params.query) {
			const results: string[] = [];
			const type = params.type ?? "all";

			if (type === "all" || type === "procedural") {
				const store = loadStore<ProceduralMemory>(cwd, "procedural.json", scope);
				const matches = searchMemories(
					store.memories,
					params.query,
					(m) => `${m.name} ${m.trigger} ${m.steps.join(" ")}`,
				);
				results.push(...matches.map(formatProceduralForDisplay));
			}
			if (type === "all" || type === "episodic") {
				const store = loadStore<EpisodicMemory>(cwd, "episodic.json", scope);
				const matches = searchMemories(store.memories, params.query, (m) => `${m.summary} ${m.details.join(" ")}`);
				results.push(...matches.map(formatEpisodicForDisplay));
			}
			if (type === "all" || type === "semantic") {
				const store = loadStore<SemanticMemory>(cwd, "semantic.json", scope);
				const matches = searchMemories(store.memories, params.query, (m) => `${m.category} ${m.text}`);
				results.push(...matches.map(formatSemanticForDisplay));
			}

			if (results.length === 0) {
				return {
					content: [{ type: "text", text: `No memories found matching "${params.query}".` }],
					details: { count: 0 },
				};
			}
			return {
				content: [{ type: "text", text: results.join("\n\n") }],
				details: { count: results.length },
			};
		}

		const type = params.type ?? "all";
		const results: string[] = [];

		if (type === "all" || type === "procedural") {
			const store = loadStore<ProceduralMemory>(cwd, "procedural.json", scope);
			if (store.memories.length > 0) {
				results.push("=== Procedural Memories ===");
				results.push(...store.memories.map(formatProceduralForDisplay));
			}
		}
		if (type === "all" || type === "episodic") {
			const store = loadStore<EpisodicMemory>(cwd, "episodic.json", scope);
			if (store.memories.length > 0) {
				results.push("=== Episodic Memories ===");
				results.push(...store.memories.map(formatEpisodicForDisplay));
			}
		}
		if (type === "all" || type === "semantic") {
			const store = loadStore<SemanticMemory>(cwd, "semantic.json", scope);
			if (store.memories.length > 0) {
				results.push("=== Semantic Memories ===");
				results.push(...store.memories.map(formatSemanticForDisplay));
			}
		}

		if (results.length === 0) {
			return {
				content: [{ type: "text", text: "No memories stored yet." }],
				details: { count: 0 },
			};
		}
		return {
			content: [{ type: "text", text: results.join("\n\n") }],
			details: { count: results.length },
		};
	},
};

// ---------------------------------------------------------------------------
// memory_update
// ---------------------------------------------------------------------------

export const memoryUpdateTool: AgentTool<typeof memoryUpdateSchema> = {
	name: "memory_update",
	label: "Update Memory",
	description:
		"Update an existing memory. Use this when the user confirms a change to a " +
		"previously stored preference, procedure step, or fact. Always ask for " +
		"confirmation before updating if there is a conflict.",
	parameters: memoryUpdateSchema,
	execute: async (_toolCallId: string, params: MemoryUpdateInput) => {
		const { cwd, scope } = memoryContext;

		const procStore = loadStore<ProceduralMemory>(cwd, "procedural.json", scope);
		const proc = procStore.memories.find((m) => m.id === params.id);
		if (proc) {
			if (params.steps) proc.steps = params.steps;
			if (params.trigger) proc.trigger = params.trigger;
			if (params.tags) proc.tags = params.tags;
			proc.updated = nowISO();
			saveStore(cwd, "procedural.json", procStore, scope);
			return {
				content: [{ type: "text", text: `Updated procedural memory [${params.id}].` }],
				details: { updated: true },
			};
		}

		const semStore = loadStore<SemanticMemory>(cwd, "semantic.json", scope);
		const sem = semStore.memories.find((m) => m.id === params.id);
		if (sem) {
			if (params.text) sem.text = params.text;
			if (params.tags) sem.tags = params.tags;
			saveStore(cwd, "semantic.json", semStore, scope);
			return {
				content: [{ type: "text", text: `Updated semantic memory [${params.id}].` }],
				details: { updated: true },
			};
		}

		const epStore = loadStore<EpisodicMemory>(cwd, "episodic.json", scope);
		const ep = epStore.memories.find((m) => m.id === params.id);
		if (ep) {
			if (params.tags) ep.tags = params.tags;
			saveStore(cwd, "episodic.json", epStore, scope);
			return {
				content: [{ type: "text", text: `Updated episodic memory [${params.id}].` }],
				details: { updated: true },
			};
		}

		return {
			content: [{ type: "text", text: `No memory found with ID "${params.id}".` }],
			details: { updated: false },
		};
	},
};

// ---------------------------------------------------------------------------
// memory_delete
// ---------------------------------------------------------------------------

export const memoryDeleteTool: AgentTool<typeof memoryDeleteSchema> = {
	name: "memory_delete",
	label: "Delete Memory",
	description:
		"Delete a specific memory by ID. Use this when the user asks to remove a memory " +
		"or when a memory is confirmed to be outdated.",
	parameters: memoryDeleteSchema,
	execute: async (_toolCallId: string, params: MemoryDeleteInput) => {
		const { cwd, scope } = memoryContext;
		const files = ["procedural.json", "episodic.json", "semantic.json"] as const;

		for (const file of files) {
			const store = loadStore<{ id: string }>(cwd, file, scope);
			const idx = store.memories.findIndex((m) => m.id === params.id);
			if (idx !== -1) {
				store.memories.splice(idx, 1);
				saveStore(cwd, file, store, scope);
				return {
					content: [{ type: "text", text: `Deleted memory [${params.id}] from ${file.replace(".json", "")}.` }],
					details: { deleted: true },
				};
			}
		}

		return {
			content: [{ type: "text", text: `No memory found with ID "${params.id}".` }],
			details: { deleted: false },
		};
	},
};

/** All memory tools */
export const memoryTools: AgentTool<any>[] = [memoryWriteTool, memoryReadTool, memoryUpdateTool, memoryDeleteTool];
