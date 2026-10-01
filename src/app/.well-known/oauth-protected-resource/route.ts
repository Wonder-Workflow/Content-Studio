import { dotMcpResourceMetadata, readDotMcpDiscovery } from "@/lib/dot-mcp-config";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = readDotMcpDiscovery(process.env);
  return config ? Response.json(dotMcpResourceMetadata(config), { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "Cloud connector is disabled or incomplete" }, { status: 503 });
}
