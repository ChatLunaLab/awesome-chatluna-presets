import { load } from "js-yaml";
import fs from "fs/promises";
import { relative } from "path";
import { CharacterPreset, isMainPreset, MainPreset, PresetData } from "./types";

async function main() {
    const presetFiles = ["presets/chatluna", "presets/chatluna-character"];

    const output: PresetData[] = await Promise.all(
        presetFiles.map((presetFile) => readPresets(presetFile))
    ).then((presets) => presets.flat());

    await fs.writeFile("presets.json", JSON.stringify(output, null, 2));
}

async function readPresets(dir: string): Promise<PresetData[]> {
    const output: PresetData[] = [];
    const files = await fs.readdir(dir);
    for (const presetFile of files) {
        const preset = await fs.readFile(`${dir}/${presetFile}`, "utf-8");
        const presetData = load(preset) as MainPreset | CharacterPreset;

        output.push({
            keywords: isMainPreset(presetData) ? presetData.keywords : [presetData.name],
            type: dir === "presets/chatluna" ? "main" : "character",
            name: presetFile.replace(".yml", ""),
            rawPath: `https://raw.githubusercontent.com/ChatLunaLab/awesome-chatluna-presets/main/${dir}/${presetFile}`,
            relativePath: `main/${dir}/${presetFile}`,
        });
    }

    return output;
}

await main();
