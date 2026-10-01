import { handleDotMcp } from "@/lib/dot-mcp";
import { readDotMcpConfig } from "@/lib/dot-mcp-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleDotMcp(request, readDotMcpConfig(process.env)); }
export async function GET(request: Request) { return handleDotMcp(request, readDotMcpConfig(process.env)); }
export async function DELETE(request: Request) { return handleDotMcp(request, readDotMcpConfig(process.env)); }
