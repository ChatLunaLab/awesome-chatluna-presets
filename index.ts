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

    const output: PresetData[] = [];
    const files = await fs.readdir(dir);
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
        }

        output.push(current);
    }

    return output;
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
            response_format: { type: "json_object" },
            temperature: 1.2,
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
            await rateLimit(); // 在每次调用前应用速率限制
            await fn();
            return;
        } catch (e) {
            console.error(e);
            i++;
        }
    }
}

const PROMPT = `
你是一个虚拟角色设定分析师，请根据用户提供的角色设定材料，严格按以下要求生成JSON格式分析报告：

{
  "rating": [根据评分标准计算1-5的小数],
  "description": [50-100字的角色特征概括，需包含：出身背景/性格特质/特殊能力/身份定位/语言风格],
  "tags": [2-5个中文短语标签，要求：反映预设的特征/通用词汇]
}

## 必须遵守的规则
1. JSON格式使用双引号，禁止注释
2. 角色描述采用总分结构：首句定义基础身份→中间展开关键特征→尾句强调特殊属性
3. 标签必须从原始设定中提取具象特征，禁止抽象形容词
4. 评分需对照评分标准矩阵综合计算

## 三维评估标准体系
Ⅰ 评分标准（5分制）
维度	5-4分标准	3-2分标准	1分标准
角色还原度	完整覆盖背景/性格/能力三维特征	涵盖两个主要维度	仅描述表面特征
细节完整度	包含隐藏设定与特殊梗	涉及基础设定	存在关键信息缺失
情感契合度	语言风格与角色设定100%匹配	有少量语气偏差	存在严重OOC现象
信息密度	每百字含≥3个特异性要素	每百字含2个特异性要素	信息呈现松散
创新性解读	挖掘出设定外的合理延伸特征	重组现有信息	完全照搬原始描述
Ⅱ 角色描述标准
1. 结构规范：
   - 首句：【角色名】是《作品名》中...（定义基础身份）
   - 中段：种族特征→核心能力→性格矛盾点→人际关系
   - 尾句：强调最具争议/特殊属性（如感染者身份、AI否认等）

2. 信息量控制：
   - 必须包含：战斗年限/出身地/生理数据/特殊病症
   - 禁止出现：主观评价/现实世界参照/跨作品比较

3. 语言规范：
   - 使用"背负式"表达（例：以...身躯肩负...重任）
   - 采用矛盾修辞（例：温柔而果决的领袖气质）
   - 包含角色标志性台词关键词
Ⅲ 标签生成标准
1. 组合规则：
   - 身份标签/特征标签
   - 游戏标签/梗文化标签
   - 预设类型标签
   - 禁忌标签：禁止出现政治/性别/种族敏感词

2. 优先级：
   (1) 官方设定关键词 > (2) 玩家二创热词 > (3) 角色外观特征
   
3. 格式要求：
   - 中文二次短语优先
   - 包含至少1个游戏内专有名词   
`;

const PROMPT_INPUT = `下面是角色设定材料：{prompt}。请根据上述要求，生成分析报告：`;

await main();
