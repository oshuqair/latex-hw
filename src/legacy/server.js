import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createConverter } from "./convert.js";

const port = Number(process.env.PORT) || 4173;
const indexPath = fileURLToPath(new URL("./index.html", import.meta.url));
const latexToSvg = await createConverter();

function readBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Expression is too large."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const indexHtml = await readFile(indexPath);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(indexHtml);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/convert") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const svg = latexToSvg(payload.latex ?? "", {
        display: payload.display !== false,
        scale: payload.scale ?? 1,
        rightToLeft: payload.rightToLeft !== false,
      });
      sendJson(res, 200, { svg });
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 400);
    sendJson(res, status, { error: error.message || "Could not convert that expression." });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`LaTeX to SVG is running at http://127.0.0.1:${port}\n`);
});
