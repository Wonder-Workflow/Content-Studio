import { POST_ID_RE } from "@/lib/posts";

export const DOT_MCP_PATH = "/api/dot/mcp";
export const DOT_MCP_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const DOT_MCP_SCOPE = "openid";

export type DotFileRule = { origin: string; pathPrefix: string };
export type DotMcpConfig = {
  origin: string;
  resource: string;
  issuer: string;
  supabaseUrl: string;
  publishableKey: string;
  ownerId: string;
  clientIds: string[];
  fileRules: DotFileRule[];
};

function httpsOrigin(value: string | undefined): string | null {
  try {
    if (!value || /[<>]/.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

/** No destination, owner, clients or file origins are guessed. Disabled by default. */
export function readDotMcpConfig(env: Record<string, string | undefined>): DotMcpConfig | null {
  if (env.DOT_MCP_ENABLED !== "true") return null;
  const origin = httpsOrigin(env.DOT_MCP_ORIGIN);
  const supabaseUrl = httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const ownerId = env.DOT_MCP_OWNER_USER_ID?.trim().toLowerCase();
  const clientIds = env.DOT_MCP_CLIENT_IDS?.split(",").map((id) => id.trim().toLowerCase()).filter(Boolean);
  if (!origin || !supabaseUrl || !publishableKey || !ownerId || !POST_ID_RE.test(ownerId)
    || !clientIds?.length || clientIds.some((id) => !POST_ID_RE.test(id))) return null;
  let rules: unknown;
  try { rules = JSON.parse(env.DOT_MCP_FILE_RULES ?? ""); } catch { return null; }
  if (!Array.isArray(rules) || rules.length < 1 || rules.length > 8) return null;
  const fileRules: DotFileRule[] = [];
  for (const rule of rules) {
    const fileOrigin = httpsOrigin(rule?.origin);
    const pathPrefix = rule?.path_prefix;
    if (!fileOrigin || typeof pathPrefix !== "string" || !/^\/[A-Za-z0-9_/-]+\/$/.test(pathPrefix)
      || pathPrefix.includes("//")) return null;
    fileRules.push({ origin: fileOrigin, pathPrefix });
  }
  return { origin, resource: `${origin}${DOT_MCP_PATH}`, issuer: `${supabaseUrl}/auth/v1`,
    supabaseUrl, publishableKey, ownerId, clientIds, fileRules };
}

export type DotMcpDiscovery = Pick<DotMcpConfig, "origin" | "resource" | "issuer">;

/** Public discovery only. This does not authorize or expose any job operation. */
export function readDotMcpDiscovery(env: Record<string, string | undefined>): DotMcpDiscovery | null {
  if (env.DOT_MCP_DISCOVERY_ENABLED !== "true" && env.DOT_MCP_ENABLED !== "true") return null;
  const origin = httpsOrigin(env.DOT_MCP_ORIGIN);
  const supabaseUrl = httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  return origin && supabaseUrl ? { origin, resource: `${origin}${DOT_MCP_PATH}`, issuer: `${supabaseUrl}/auth/v1` } : null;
}

export function dotMcpResourceMetadata(config: DotMcpDiscovery) {
  return { resource: config.resource, authorization_servers: [config.issuer],
    scopes_supported: [DOT_MCP_SCOPE], bearer_methods_supported: ["header"] };
}

export function dotMcpChallenge(config: DotMcpDiscovery) {
  return `Bearer resource_metadata="${config.origin}${DOT_MCP_METADATA_PATH}", scope="${DOT_MCP_SCOPE}", error="invalid_token", error_description="Link the approved owner account with a resource-bound OAuth access token"`;
}

export function isDotMcpProtocolPath(path: string) {
  return path === DOT_MCP_PATH || path === DOT_MCP_METADATA_PATH;
}
