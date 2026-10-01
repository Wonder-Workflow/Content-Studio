import { handleDotMcp } from "@/lib/dot-mcp";
import { readDotMcpConfig, readDotMcpDiscovery, dotMcpChallenge } from "@/lib/dot-mcp-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const config = readDotMcpConfig(process.env);
  if (!config) {
    const discovery = readDotMcpDiscovery(process.env);
    if (discovery) return Response.json({ error: "OAuth setup is required; job tools remain disabled" },
      { status: 401, headers: { "WWW-Authenticate": dotMcpChallenge(discovery), "Cache-Control": "no-store" } });
  }
  return handleDotMcp(request, config);
}
export async function POST(request: Request) { return handle(request); }
export async function GET(request: Request) { return handle(request); }
export async function DELETE(request: Request) { return handle(request); }
