const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 5173);
const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
};

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleNetlifyFunction(request, response, urlPath) {
  if (urlPath !== "/.netlify/functions/send-email") return false;

  try {
    const { handler } = require("./netlify/functions/send-email");
    const result = await handler({
      httpMethod: request.method,
      headers: request.headers,
      body: await readRequestBody(request),
    });

    response.writeHead(result.statusCode || 200, result.headers || {});
    response.end(result.body || "");
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: false,
      error: `Local email function failed: ${error.message}`,
    }));
  }

  return true;
}

const server = http.createServer(async (request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
  if (await handleNetlifyFunction(request, response, urlPath)) return;

  const requestPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(root, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }

        response.writeHead(200, { "Content-Type": types[".html"] });
        response.end(fallbackContent);
      });
      return;
    }

    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  });
});

server.listen(port, () => {
  console.log(`Facility Access app running at http://localhost:${port}`);
});
