import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DOT_MCP_SCOPE, type DotMcpConfig } from "@/lib/dot-mcp-config";
import { POST_ID_RE } from "@/lib/posts";

/** Called only on claims whose signature was already verified by Supabase Auth. */
export function dotMcpClaimsAllowed(claims: Record<string, unknown>, config: DotMcpConfig, now = Date.now() / 1000) {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const scopes = typeof claims.scope === "string" ? claims.scope.split(/\s+/) : [];
  // OpenAI permits a signed aud OR resource binding. Keep Supabase's standard
  // audience for its Auth/Data APIs when the hook adds the exact resource claim.
  const bound = audiences.includes(config.resource)
    || (audiences.includes("authenticated") && claims.resource === config.resource);
  return claims.iss === config.issuer && bound
    && (claims.resource === undefined || claims.resource === config.resource)
    && claims.sub === config.ownerId && claims.role === "authenticated" && claims.is_anonymous !== true
    && typeof claims.client_id === "string" && config.clientIds.includes(claims.client_id)
    && typeof claims.session_id === "string" && POST_ID_RE.test(claims.session_id)
    && typeof claims.exp === "number" && Number.isFinite(claims.exp) && claims.exp > now
    && typeof claims.iat === "number" && Number.isFinite(claims.iat) && claims.iat <= now
    && (claims.nbf === undefined || (typeof claims.nbf === "number" && Number.isFinite(claims.nbf) && claims.nbf <= now))
    && scopes.includes(DOT_MCP_SCOPE);
}

export function dotMcpUserClient(config: DotMcpConfig, token: string) {
  return createClient(config.supabaseUrl, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function authenticateDotMcp(request: Request, config: DotMcpConfig,
  makeClient: (config: DotMcpConfig, token: string) => SupabaseClient = dotMcpUserClient) {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match || match[1].length > 16_000) return null;
  const token = match[1];
  const client = makeClient(config, token);
  try {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data || !["RS256", "ES256"].includes(data.header.alg)
      || !dotMcpClaimsAllowed(data.claims, config)) return null;
    const user = await client.auth.getUser(token);
    if (user.error || user.data.user?.id !== config.ownerId || user.data.user.is_anonymous) return null;
    return { client, ownerId: config.ownerId };
  } catch { return null; }
}

export type ScopedDotJob = {
  id: string;
  status: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  expectedPositions: number[] | null;
};

/** The OAuth user's RLS plus created_by check run before any privileged callback. */
export async function loadOwnedDotJob(client: SupabaseClient, ownerId: string, id: string): Promise<ScopedDotJob | null> {
  const { data, error } = await client.from("art_jobs")
    .select("id, status, lease_token, lease_expires_at, expected_positions")
    .eq("id", id).eq("created_by", ownerId).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, status: data.status, leaseToken: data.lease_token,
    leaseExpiresAt: data.lease_expires_at, expectedPositions: data.expected_positions };
}
