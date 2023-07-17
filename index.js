import { load } from "js-yaml"
import fs from "fs/promises"

async function main() {
    const presetFiles = await fs.readdir("presets")

    const output = []
    for (const presetFile of presetFiles) {
        const preset = await fs.readFile(`presets/${presetFile}`, "utf-8")
        const presetData = load(preset)

        output.push({
            keywords: presetData.keywords,
            name: presetFile.replace(".yml", ""),
            rawPath: `https://raw.githubusercontent.com/ChatHubLab/awesome-chathub-presets/main/presets/${presetFile}`,
        })
    }

    await fs.writeFile("presets.json", JSON.stringify(output, null, 2))
}



await main()