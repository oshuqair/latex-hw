import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dictionaryPath = fileURLToPath(new URL("../../dictionary.md", import.meta.url));

export function loadDictionary(path = dictionaryPath) {
  const entries = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Za-z]+)\s*->\s*(.+?)\s*$/);
    if (match) entries.push([match[1], match[2]]);
  }
  entries.sort((a, b) => b[0].length - a[0].length);
  return entries;
}

export function translateOperators(tex, entries = loadDictionary()) {
  let result = tex;
  for (const [english, arabic] of entries) {
    const pattern = new RegExp(`\\\\${english}(?![A-Za-z])`, "g");
    result = result.replace(pattern, `\\mathop{\\text{${arabic}}}`);
  }
  return result;
}
