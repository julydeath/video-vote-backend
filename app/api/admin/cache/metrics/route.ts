import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { getCacheMetrics, resetCacheMetrics } from "@/app/lib/publicCache";
import { getRedisClient } from "@/app/lib/redis";

export async function GET(req: Request) {
  const r = await requireAdmin(req);
  if (!r.ok) return r.res;

  const redis = await getRedisClient();
  let redisInfo: Record<string, string | number> | null = null;

  if (redis) {
    try {
      const info = await redis.info();
      const lines = info.split("\n");
      const map: Record<string, string> = {};
      for (const line of lines) {
        if (!line || line.startsWith("#") || !line.includes(":")) continue;
        const [k, v] = line.split(":");
        map[k] = v?.trim();
      }
      redisInfo = {
        used_memory_human: map.used_memory_human,
        connected_clients: Number(map.connected_clients || 0),
        total_commands_processed: Number(map.total_commands_processed || 0),
        uptime_in_seconds: Number(map.uptime_in_seconds || 0),
      };
    } catch {
      redisInfo = null;
    }
  }

  return NextResponse.json({
    ok: true,
    metrics: getCacheMetrics(),
    redis: redisInfo,
  });
}

export async function POST(req: Request) {
  const r = await requireAdmin(req);
  if (!r.ok) return r.res;

  const { action } = await req.json().catch(() => ({}));
  if (action === "reset") {
    resetCacheMetrics();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
