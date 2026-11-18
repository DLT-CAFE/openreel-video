// DLT Cafe: creator styles for the desktop editor, served on the app's own scheme
// (app://openreel/__dltcafe/styles/…) from the local pack folder. Same paths as the
// web bridge hub (packages/mcp-bridge/src/styles.ts), minus the pairing code: only
// this app's pages can load app:// URLs.
import { net } from "electron";
import { pathToFileURL } from "node:url";
import { buildStylesIndex, contentType, readStylesRoot, resolveStyleFile, writeStylesRoot } from "../../../../packages/mcp-bridge/src/styles";

export const STYLES_PREFIX = "/__dltcafe/styles/";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function handleStylesRequest(request: Request, pathname: string): Promise<Response> {
  const rel = pathname.slice(STYLES_PREFIX.length);
  if (rel === "index.json" && request.method === "GET") return json(200, buildStylesIndex());
  if (rel === "config" && request.method === "POST") {
    try {
      const body = (await request.json()) as { root?: string };
      const err = writeStylesRoot(String(body.root ?? ""));
      return err ? json(400, { error: err }) : json(200, { ok: true, root: readStylesRoot() });
    } catch {
      return json(400, { error: "Bad request" });
    }
  }
  const file = request.method === "GET" ? resolveStyleFile(rel) : null;
  if (!file) return json(404, { error: "Not found" });
  const upstream = await net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
  const headers = new Headers(upstream.headers);
  headers.set("Content-Type", contentType(file));
  headers.set("Cache-Control", "no-store");
  // Live samples load scripts from a CDN; the page embeds them in a credentialless iframe.
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}
