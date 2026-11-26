// Runs the function as a plain HTTP server for local testing:
//   STATS_DATABASE_URL=... STATS_DATABASE_SSL=off STATS_ALLOWED_ORIGINS=http://127.0.0.1:4173 npm run serve
import http from "node:http";
import { handle } from "../src/handler.js";

const port = Number(process.env.PORT || 8787);
http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const result = await handle({
      httpMethod: req.method,
      path: url.pathname,
      headers: { ...req.headers, "x-forwarded-for": req.socket.remoteAddress },
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: Buffer.concat(chunks).toString("utf8"),
      isBase64Encoded: false
    });
    console.log(req.method, url.pathname, result.statusCode);
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  });
}).listen(port, "127.0.0.1", () => console.log(`stats function on http://127.0.0.1:${port}`));
