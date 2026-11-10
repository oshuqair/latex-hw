#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { stdin, stderr } from "node:process";
import { createConverter } from "./convert.js";

const help = `Convert a LaTeX math expression to a standalone SVG.
The result reads right to left. Each character is mirrored back so it has its normal shape.

Usage:
  npm start
  node cli.js '\\frac{a}{b}' -o fraction.svg
  node cli.js -f formula.tex -o formula.svg
  echo '\\int_0^1 x^2 \\, dx' | node cli.js -o integral.svg

Options:
  -o, --out <file>    write the SVG to a file (default: stdout)
  -f, --file <file>   read the expression from a file
  -i, --inline        render in inline style instead of display style
  -s, --scale <n>     size multiplier (default: 1)
  -h, --help          show this help

Use single quotes in the shell so backslashes reach the converter.
$$...$$, \\[...\\], $...$, and \\(...\\) wrappers are stripped automatically.
`;

function parseArgs(argv) {
  const opts = {
    out: null,
    file: null,
    inline: false,
    scale: 1,
    help: false,
    parts: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "-i" || arg === "--inline") opts.inline = true;
    else if (arg === "-o" || arg === "--out") opts.out = required(argv, ++i, arg);
    else if (arg === "-f" || arg === "--file") opts.file = required(argv, ++i, arg);
    else if (arg === "-s" || arg === "--scale") {
      opts.scale = Number(required(argv, ++i, arg));
    } else if (arg === "--") {
      opts.parts.push(...argv.slice(i + 1));
      break;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      opts.parts.push(arg);
    }
  }

  return opts;
}

function required(argv, index, flag) {
  if (index >= argv.length) throw new Error(`Missing value for ${flag}`);
  return argv[index];
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stdin.on("data", (chunk) => chunks.push(chunk));
    stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stdin.on("error", reject);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(help);
    return;
  }

  let expression = opts.parts.join(" ");
  if (opts.file && expression) {
    throw new Error("Pass an expression or --file, not both.");
  }
  if (opts.file) {
    expression = readFileSync(opts.file, "utf8");
  } else if (!expression) {
    if (stdin.isTTY) {
      process.stdout.write(help);
      return;
    }
    expression = await readStdin();
  }

  const latexToSvg = await createConverter();
  const svg = latexToSvg(expression, {
    display: !opts.inline,
    scale: opts.scale,
  });

  if (opts.out) {
    writeFileSync(opts.out, svg);
    stderr.write(`wrote ${opts.out} (${Buffer.byteLength(svg)} bytes)\n`);
  } else {
    process.stdout.write(svg);
  }
}

main().catch((error) => {
  stderr.write(`${error.message}\n`);
  process.exit(1);
});
