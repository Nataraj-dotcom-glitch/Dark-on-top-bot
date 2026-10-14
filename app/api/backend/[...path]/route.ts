import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: { path: string[] } };

type SessionWithToken = {
  accessToken?: string;
  user?: { id?: string | null } | null;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  if (!session?.user?.id || !session.accessToken) {
    return Response.json({ detail: "Sign in with Discord to access the dashboard API." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const path = context.params.path || [];
  const firstSegment = path[0] || "";
  const adminIds = (process.env.NEXT_PUBLIC_ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const isDashboardAdmin = adminIds.includes(session.user.id);

  if (firstSegment === "admin" && !isDashboardAdmin) {
    return Response.json({ detail: "Administrator access is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  // Do not expose the complete bot guild list through the browser proxy. Server
  // pages can fetch it server-side and intersect it with the user's own guilds.
  if (firstSegment === "guilds" && !path[1]) {
    return Response.json({ detail: "A specific manageable server is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  // Enforce Discord Manage Server / Administrator permissions server-side for
  // every guild-scoped read or write, rather than trusting hidden UI controls.
  if (firstSegment === "guilds" && path[1]) {
    try {
      const guildResponse = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      });
      if (!guildResponse.ok) {
        return Response.json({ detail: "Could not verify your Discord server permissions. Please sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      }
      const userGuilds = (await guildResponse.json()) as Array<{ id: string; owner?: boolean; permissions?: string }>;
      const guild = userGuilds.find((item) => String(item.id) === String(path[1]));
      let canManage = guild?.owner === true;
      if (guild?.permissions) {
        try {
          const permissions = BigInt(guild.permissions);
          const ADMINISTRATOR = BigInt(0x8);
          const MANAGE_GUILD = BigInt(0x20);
          canManage = canManage || (permissions & ADMINISTRATOR) === ADMINISTRATOR || (permissions & MANAGE_GUILD) === MANAGE_GUILD;
        } catch {
          // Invalid permission data does not grant access.
        }
      }
      if (!guild || !canManage) {
        return Response.json({ detail: "You need Manage Server or Administrator permission for this Discord server." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
    } catch (error) {
      console.error("Unable to verify Discord guild permissions:", error);
      return Response.json({ detail: "Unable to verify Discord permissions right now." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  }

  const apiBase = (process.env.DASHBOARD_API_URL || process.env.NEXT_PUBLIC_API_URL || "").trim();
  const apiKey = (process.env.DASHBOARD_API_KEY || "").trim();
  if (!apiBase || !apiKey) {
    return Response.json(
      { detail: "Dashboard API is not configured. Set DASHBOARD_API_URL and DASHBOARD_API_KEY in the dashboard server environment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const base = apiBase.endsWith("/") ? apiBase : `${apiBase}/`;
  const safePath = path.map((part) => encodeURIComponent(part)).join("/");
  const incoming = new URL(request.url);
  const target = new URL(`${safePath}${incoming.search}`, base);
  const headers = new Headers({ Authorization: `Bearer ${apiKey}` });
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) headers.set("Content-Type", contentType);
  if (accept) headers.set("Accept", accept);

  try {
    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstream = await fetch(target, { method, headers, body, cache: "no-store", redirect: "manual" });
    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error("Dashboard API proxy request failed:", error);
    return Response.json(
      { detail: "Unable to reach the bot API. Check the dashboard API URL and bot service status." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
