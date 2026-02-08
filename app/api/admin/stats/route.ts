import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import {
  acquireLock,
  checkRateLimit,
  getCached,
  releaseLock,
  setCached,
} from "@/app/lib/publicCache";

export async function GET(req: Request) {
  let lockAcquired = false;
  let lockKey = "";
  const r = await requireAdmin(req);
  if (!r.ok) return r.res;

  const url = new URL(req.url);
  const fresh =
    url.searchParams.get("fresh") === "1" ||
    req.headers.get("x-cache-bypass") === "1";

  const cacheKey = "admin-stats";
  if (!fresh) {
    const cached = await getCached<{ ok: boolean }>(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  if (fresh) {
    const limitCheck = await checkRateLimit(req.headers, {
      keyPrefix: "refresh-admin-stats",
      keySuffix: r.user.id,
      max: 20,
      windowMs: 60_000,
    });
    if (!limitCheck.ok) {
      return NextResponse.json(
        { error: "Refresh rate limit exceeded" },
        {
          status: 429,
          headers: { "Retry-After": String(limitCheck.retryAfter) },
        },
      );
    }
    lockKey = "lock:admin-stats";
    lockAcquired = await acquireLock(lockKey, 3000);
    if (!lockAcquired) {
      const cached = await getCached<{ ok: boolean }>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }
  }

  try {
    const [total, up, down] = await Promise.all([
      prisma.vote.count(),
      prisma.vote.count({ where: { voteType: "UP" } }),
      prisma.vote.count({ where: { voteType: "DOWN" } }),
    ]);

    const topContent = await prisma.vote.groupBy({
      by: ["contentId"],
      _count: { contentId: true },
      orderBy: { _count: { contentId: "desc" } },
      take: 10,
    });

    const topUsers = await prisma.vote.groupBy({
      by: ["userId"],
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 10,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: topUsers.map((u) => u.userId) } },
      select: { id: true, email: true, name: true },
    });

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const payload = {
      ok: true,
      totals: {
        votes: total,
        upvotes: up,
        downvotes: down,
      },
      topContent: topContent.map((c) => ({
        contentId: c.contentId,
        count: c._count.contentId,
      })),
      topUsers: topUsers.map((u) => ({
        user: userMap[u.userId],
        count: u._count.userId,
      })),
    };

    await setCached(cacheKey, payload, 30_000);
    if (lockAcquired) await releaseLock(lockKey);
    return NextResponse.json(payload);
  } catch (e: any) {
    if (lockAcquired && lockKey) await releaseLock(lockKey);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
