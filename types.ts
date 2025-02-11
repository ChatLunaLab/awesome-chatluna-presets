export interface MainPreset {
    keywords: string[];
    prompts: BaseMessage[];
    format_user_prompt?: string;
    world_lores?: (WorldLoreConfig | RawWorldLore)[];
    version?: string;
    authors_note?: AuthorsNote;
    knowledge?: KnowledgeConfig;
    config?: {
        longMemoryPrompt?: string;
        loreBooksPrompt?: string;
        longMemoryExtractPrompt?: string;
        longMemoryNewQuestionPrompt?: string;
        postHandler?: PostHandler;
    };
}

export interface RawWorldLore {
    keywords: string | (string | RegExp)[];
    content: string;
    insertPosition?:
        | "before_char_defs"
        | "after_char_defs"
        | "before_scenario"
        | "after_scenario"
        | "before_example_messages"
        | "after_example_messages";
    scanDepth?: number;
    recursiveScan?: boolean;
    maxRecursionDepth?: number;
    matchWholeWord?: boolean;
    constant?: boolean;
    caseSensitive?: boolean;
    enabled?: boolean;
    order?: number;
    tokenLimit?: number;
}

export interface WorldLoreConfig extends RawWorldLore {
    scanDepth?: number;
    tokenLimit?: number;
    recursiveScan?: boolean;
    maxRecursionDepth?: number;
    insertPosition?:
        | "before_char_defs"
        | "after_char_defs"
        | "before_scenario"
        | "after_scenario"
        | "before_example_messages"
        | "after_example_messages";
}

export function isWorldLoreConfig(
    obj: RawWorldLore | WorldLoreConfig
): obj is WorldLoreConfig {
    return !isWorldLore(obj) && typeof obj === "object" && obj !== null;
}

export function isWorldLore(
    obj: RawWorldLore | WorldLoreConfig
): obj is RawWorldLore {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "keywords" in obj &&
        "content" in obj
    );
}

export interface RoleBook {
    keywords: (string | RegExp)[];
    content: string;
    scanDepth?: number;
    recursiveScan?: boolean;
    maxRecursionDepth?: number;
    matchWholeWord?: boolean;
    caseSensitive?: boolean;
    enabled?: boolean;
    constant?: boolean;
    order?: number;
    insertPosition?:
        | "before_char_defs"
        | "after_char_defs"
        | "before_example_messages"
        | "after_example_messages";
}

export type RoleBookConfig = Omit<PresetTemplate["loreBooks"], "items">;

export interface BaseMessage {
    role: "user" | "system" | "assistant";
    type?: "personality" | "description" | "first_message" | "scenario";
    content: string;
}

export interface PresetTemplate {
    version?: string;
    triggerKeyword: string[];
    rawText: string;
    messages: BaseMessage[];
    formatUserPromptString?: string;
    path?: string;
    loreBooks?: {
        scanDepth?: number;
        items: RoleBook[];
        tokenLimit?: number;
        recursiveScan?: boolean;
        maxRecursionDepth?: number;
        insertPosition?:
            | "before_char_defs"
            | "after_char_defs"
            | "before_example_messages"
            | "after_example_messages";
    };
    authorsNote?: AuthorsNote;
    knowledge?: KnowledgeConfig;
    config: {
        longMemoryPrompt?: string;
        loreBooksPrompt?: string;
        longMemoryExtractPrompt?: string;
        longMemoryNewQuestionPrompt?: string;
        postHandler?: PostHandler;
    };
}

export interface PostHandler {
    prefix: string;
    postfix: string;
    censor?: boolean;
    variables: Record<string, string>;
}

export interface KnowledgeConfig {
    knowledge: string[] | string;
    prompt?: string;
}

export interface AuthorsNote {
    content: string;
    insertPosition?: "after_char_defs" | "in_chat";
    insertDepth?: number;
    insertFrequency?: number;
}

export function isRoleBook(obj: unknown): obj is RoleBook {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "keywords" in obj &&
        "content" in obj
    );
}

export function isRoleBookConfig(obj: unknown): obj is RoleBookConfig {
    return !isRoleBook(obj) && typeof obj === "object" && obj !== null;
}

export function isMainPreset(obj: unknown): obj is MainPreset {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "keywords" in obj &&
        "prompts" in obj
    );
}

export function isCharacterPreset(obj: unknown): obj is CharacterPreset {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "name" in obj &&
        "nick_name" in obj &&
        "input" in obj &&
        "system" in obj
    );
}

export interface CharacterPreset {
    name: string;
    status?: string;
    nick_name: string[];
    input: string;
    system: string;
    mute_keyword?: string[];
    path?: string;
}

export interface PresetData {
    name: string;
    keywords: string[];
    rawPath: string;
    relativePath: string;
    type: "main" | "character";
}
