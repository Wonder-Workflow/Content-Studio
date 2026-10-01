import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

const MAX_BODY = 4_000_000;

export function createDotClient({ origin, secret, imageRoot, fetchImpl = fetch }) {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Use a plain app origin.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Use HTTPS, or loopback HTTP for local testing.");
  }
  if (!secret || /[\r\n]/.test(secret)) throw new Error("A callback bearer is required.");
  async function call(id, action = "", body) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid job id.");
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload && Buffer.byteLength(payload) > MAX_BODY) throw new Error("All images plus JSON must fit under 4 MB. Resize/compress the files, or use real HTTPS image URLs.");
    const response = await fetchImpl(new URL(`/api/dot/art-jobs/${id}${action ? `/${action}` : ""}`, url), {
      method: payload === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: payload,
      redirect: "error",
      signal: AbortSignal.timeout(180_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Studio ${response.status}: ${result.error ?? "Request failed"}`);
    return result;
  }
  async function completeFiles(id, leaseToken, paths) {
    if (!imageRoot) throw new Error("An explicitly allowed image folder is required.");
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 10) throw new Error("Send the entire expected set of 1–10 images.");
    const root = await realpath(imageRoot);
    const images = [];
    for (const path of paths) {
      if (!isAbsolute(path)) throw new Error("Use an existing absolute file path returned by the image tool.");
      const resolved = await realpath(path);
      const rel = relative(root, resolved);
      if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Image is outside the allowed folder.");
      const file = await open(resolved, "r");
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 3_000_000) throw new Error("Use small regular image files; the full request must fit under 4 MB.");
        const bytes = await file.readFile();
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
        if (!png && !jpg && !webp) throw new Error("Only actual PNG, JPEG and WebP files are accepted.");
        images.push({ base64: bytes.toString("base64") });
      } finally {
        await file.close();
      }
    }
    return call(id, "complete", { lease_token: leaseToken, images });
  }
  return { call, completeFiles };
}
