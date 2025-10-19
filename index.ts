import { load } from "js-yaml";
import fs from "fs/promises";
import { relative } from "path";
import {
    CachePresetData,
    CharacterPreset,
    isMainPreset,
    MainPreset,
    PresetData,
} from "./types";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function main() {
    const presetFiles = ["presets/chatluna", "presets/chatluna-character"];

    const cachePresetData = await readCachePresetData();

    const output: PresetData[] = await Promise.all(
        presetFiles.map((presetFile) =>
            readPresets(presetFile, cachePresetData)
        )
    ).then((presets) => presets.flat());

    await fs.writeFile("presets.json", JSON.stringify(output, null, 2));
    await fs.writeFile(
        "cache-presets.json",
        JSON.stringify(cachePresetData, null, 2)
    );
}

async function readPresets(
    dir: string,
    cachePresets: CachePresetData[]
): Promise<PresetData[]> {
    const isRunningOnGitHub = process.env.GITHUB_ACTIONS === "true";

    let output: PresetData[] = [];
    const files = await fs.readdir(dir);

    const modifiedTimes = await Promise.all(
        files.map(async (file) => {
            return [
                file,
                await getGitLastModifiedDate(`${dir}/${file}`),
            ] as const;
        })
    );

    for (const presetFile of files) {
        const preset = await fs.readFile(`${dir}/${presetFile}`, "utf-8");
        const presetData = load(preset) as MainPreset | CharacterPreset;
        const rawPath = `https://raw.githubusercontent.com/ChatLunaLab/awesome-chatluna-presets/main/${dir}/${presetFile}`;

        let current: PresetData = {
            keywords: isMainPreset(presetData)
                ? presetData.keywords
                : [presetData.name],
            type: dir === "presets/chatluna" ? "main" : "character",
            name: presetFile.replace(".yml", ""),
            rawPath,
            modified: modifiedTimes.find(([file]) => file === presetFile)![1],
            relativePath: `main/${dir}/${presetFile}`,
        };

        const cachePresetData = cachePresets.find(
            (preset) => preset.rawPath === rawPath
        );

        if (
            cachePresetData &&
            (isRunningOnGitHub || cachePresetData.sha1 === (await sha1(preset)))
        ) {
            current = Object.assign(current, {
                description: cachePresetData.description,
                rating: cachePresetData.rating,
                tags: cachePresetData.tags,
            });
        } else {
            await retry(async () => {
                current = Object.assign(current, {
                    ...(await readAIDescription(preset, cachePresets, rawPath)),
                });
            }, 3);

            output = output.filter((preset) => preset.rawPath !== rawPath);
        }

        output.push(current);
    }

    return output;
}

async function getGitLastModifiedDate(filePath: string): Promise<number> {
    try {
        // Use double quotes for Windows compatibility
        const command = `git log -1 --format="%ad" --date=iso-strict "${filePath}"`;

        // Execute the command
        const { stdout } = await execAsync(command);

        // Trim any extra whitespace or newlines from the output
        const result = stdout.trim();

        // Transform the result to timestamp
        return new Date(result).getTime();
    } catch (error) {
        console.error(
            `Error getting last modified date for file ${filePath}:`,
            error
        );
        throw error;
    }
}
async function readAIDescription(
    preset: string,
    cachePresets: CachePresetData[],
    rawPath: string
) {
    const apiKey = process.env.API_KEY;
    const baseUrl = process.env.BASE_URL;
    let model = process.env.MODEL ?? "gpt-4o-mini";

    if (!apiKey || !baseUrl) {
        console.warn(
            "No API key or base URL provided, skipping AI description generation"
        );
        return {};
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: "system",
                    content: PROMPT,
                },
                {
                    role: "user",
                    content: PROMPT_INPUT.replace("{prompt}", preset),
                },
            ],
            response_format: {
                type: "json_object",
                schema: {
                    type: "object",
                    properties: {
                        rating: {
                            type: "number",
                            description:
                                "The rating of the preset, from 1 to 10",
                        },
                        description: {
                            type: "string",
                            description: "The description of the preset",
                        },
                        tags: {
                            type: "array",
                            description: "The tags of the preset",
                        },
                    },
                },
            },
            temperature: 1.5,
        }),
    }).then((res) => res.json());

    if (!response.choices?.[0]?.message?.content) {
        throw new Error(
            `Failed to generate AI description: ${JSON.stringify(response)}`
        );
    }

    let jsonContent = response.choices[0].message.content;

    const responseContent = parseJSON(jsonContent);

    const cachePreset: CachePresetData = {
        ...responseContent,
        sha1: await sha1(preset),
        rawPath,
    };

    cachePresets.push(cachePreset);

    await fs.writeFile(
        "cache-presets.json",
        JSON.stringify(cachePresets, null, 2)
    );
}

function parseJSON(str: string): {
    rating: number;
    description: string;
    tags: string[];
} {
    try {
        const result = JSON.parse(str);

        if (result.rating && result.description && result.tags) {
            return result;
        }

        throw new Error("Invalid JSON string: " + str);
    } catch (e) {
        let match = str.match(/```json([\s\S]*?)```/);
        if (match) {
            return JSON.parse(match[1]);
        }

        // first { and last }
        match = str.match(/^{([\s\S]*?)}$/);
        if (match) {
            return JSON.parse(match[1]);
        }
    }

    throw new Error("Invalid JSON string: " + str);
}

async function sha1(str: string) {
    const hash = crypto.createHmac("sha256", "chatluna");
    hash.update(str);
    return hash.digest("hex");
}

async function readCachePresetData(): Promise<CachePresetData[]> {
    let data: string;

    try {
        data = await fs.readFile("cache-presets.json", "utf-8");
        return JSON.parse(data) as CachePresetData[];
    } catch (e) {}

    try {
        return await fetch(
            "https://raw.githubusercontent.com/ChatLunaLab/awesome-chatluna-presets/refs/heads/preset/cache-presets.json",
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                },
            }
        ).then((res) => res.json());
    } catch (e) {
        return await fetch(
            "https://raw.githubusercontent.com/ChatLunaLab/awesome-chatluna-presets/refs/heads/main/cache-presets.json",
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                },
            }
        )
            .then((res) => res.json())
            .catch((e) => {
                console.warn(
                    "Failed to read cache-presets.json, using empty array"
                );
                return [];
            });
    }
}

function createRateLimiter(limitPerMinute: number) {
    const interval = 60000 / limitPerMinute;
    let lastCallTime = 0;

    return async function rateLimit() {
        const now = Date.now();
        const elapsedTime = now - lastCallTime;

        if (elapsedTime < interval) {
            await new Promise((resolve) =>
                setTimeout(resolve, interval - elapsedTime)
            );
        }

        lastCallTime = Date.now();
    };
}

const rateLimit = createRateLimiter(15);

async function retry(fn: () => Promise<void>, times: number) {
    let i = 0;
    while (i < times) {
        try {
            await rateLimit();
            await fn();
            return;
        } catch (e) {
            console.error(e);
            i++;
        }
    }
}

const PROMPT = `
您是ChatLuna预设分析专家，请分析用户提供的预设内容并生成符合JSON格式的评估报告：

{
  "rating": [1-5分的评分，精确到小数点后一位],
  "description": [80-120字的预设功能概述，包括：使用场景/主要功能/特色优势],
  "tags": [3-5个准确标签，反映预设的核心特征和用途]
}

## 分析要求
1. 严格JSON格式输出，使用双引号，无注释
2. 根据预设类型提供不同分析侧重点：
   - 角色预设(character)：关注角色特征、个性塑造和对话风格
   - 主要预设(main)：关注功能实现、提示词设计和应用场景

## 评分标准（5分制）
评分维度：
1. 完整性（0-1分）：预设结构完整，包含必要组件
2. 专业性（0-1分）：提示词设计专业，符合AI模型理解规范
3. 实用性（0-1分）：解决实际问题，提供明确价值
4. 创新性（0-1分）：有独特设计或创新点
5. 清晰度（0-1分）：指令清晰，逻辑合理，易于执行

## 描述撰写指南
1. 概述结构：
   - 开头：简明介绍预设的核心功能和主要用途
   - 中段：详述独特优势和关键特性
   - 结尾：总结应用场景或使用效果

2. 内容要点：
   - 角色预设：角色背景、性格特点、交流风格
   - 主要预设：核心功能、处理方式、输出形式

3. 语言风格：
   - 使用客观、专业，和预设风格类似的描述语言
   - 避免过度营销式表达
   - 保持描述准确性
   - 不使用成语，比喻等，避免破折号，双引号

## 标签生成规则
1. 标签类型组合：
   - 功能类标签（如：知识问答、创意写作）
   - 技术类标签（如：向量检索、长文本处理）
   - 场景类标签（如：学习辅助、工作效率）

2. 标签优先级：
   - 核心功能 > 技术特点 > 应用场景

3. 标签格式：
   - 使用简洁中文短语
   - 每个标签2-4个字
   - 避免重复信息
`;

const PROMPT_INPUT = `下面是预设内容：{prompt}。请根据上述要求，生成代入角色的，第一人称的分析报告：`;

await main();
