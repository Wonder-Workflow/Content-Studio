import type { OAuthAuthorizationDetails, SupabaseClient } from "@supabase/supabase-js";
import { readDotMcpConfig, type DotMcpConfig } from "@/lib/dot-mcp-config";

export type DotConsentConfig = DotMcpConfig & { redirectUris: string[] };
export function readDotConsentConfig(env: Record<string, string | undefined>): DotConsentConfig | null {
  if (env.DOT_MCP_CONSENT_ENABLED !== "true") return null;
  const config = readDotMcpConfig(env);
  if (!config) return null;
  try {
    const entries: unknown = JSON.parse(env.DOT_MCP_REDIRECT_URIS ?? "");
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8) return null;
    const redirectUris = entries.map((entry) => {
      if (typeof entry !== "string" || /[<>\\\s]/.test(entry)) throw new Error();
      const url = new URL(entry);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error();
      return url.href;
    });
    return { ...config, redirectUris };
  } catch { return null; }
}

export function dotConsentDetailsAllowed(details: OAuthAuthorizationDetails, config: DotConsentConfig, id: string) {
  const scopes = details.scope.split(/\s+/).filter(Boolean);
  return details.authorization_id === id && details.user.id === config.ownerId
    && config.clientIds.includes(details.client.id)
    && scopes.includes("openid") && scopes.every((scope) => ["openid", "email", "profile", "phone"].includes(scope))
    && config.redirectUris.includes(details.redirect_uri);
}

export function dotConsentRedirectAllowed(raw: string, config: DotConsentConfig) {
  try {
    if (/[\\\s]/.test(raw)) return false;
    const target = new URL(raw);
    if (target.protocol !== "https:" || target.username || target.password || target.hash) return false;
    return config.redirectUris.some((entry) => {
      const registered = new URL(entry);
      return target.origin === registered.origin && target.pathname === registered.pathname
        && [...registered.searchParams].every(([key, value]) => target.searchParams.getAll(key).includes(value))
        && [...target.searchParams.keys()].every((key) => registered.searchParams.has(key)
          || ["code", "state", "iss", "error", "error_description", "error_uri"].includes(key));
    });
  } catch { return false; }
}

export async function readDotConsent(client: SupabaseClient, config: DotConsentConfig | null, id: string) {
  if (!config || !/^[A-Za-z0-9_-]{1,256}$/.test(id)) return null;
  const user = await client.auth.getUser();
  if (user.error || user.data.user?.id !== config.ownerId || user.data.user.is_anonymous) return null;
  const result = await client.auth.oauth.getAuthorizationDetails(id);
  // Auto-approved redirects omit client details. Do not infer their identity.
  if (result.error || !result.data || !("authorization_id" in result.data)
    || !dotConsentDetailsAllowed(result.data, config, id)) return null;
  return result.data;
}

export async function decideDotConsent(client: SupabaseClient, config: DotConsentConfig | null, id: string, decision: string) {
  if (decision !== "approve" && decision !== "deny") return null;
  const details = await readDotConsent(client, config, id);
  if (!details || !config) return null;
  const result = decision === "approve"
    ? await client.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await client.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (result.error || !result.data || !dotConsentRedirectAllowed(result.data.redirect_url, config)) return null;
  return result.data.redirect_url;
}
