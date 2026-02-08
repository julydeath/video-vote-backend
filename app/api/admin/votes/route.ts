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

  const { searchParams } = new URL(req.url);
  const fresh =
    searchParams.get("fresh") === "1" ||
    req.headers.get("x-cache-bypass") === "1";

  const userId = searchParams.get("userId");
  const voteType = searchParams.get("voteType");
  const contentId = searchParams.get("contentId");
  const q = searchParams.get("q");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Number(searchParams.get("limit") || 100);

  const where: any = {};

  if (userId) where.userId = userId;
  if (contentId) where.contentId = contentId;

  if (voteType === "UP" || voteType === "DOWN") {
    where.voteType = voteType;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  if (q) {
    where.OR = [
      { pageUrl: { contains: q, mode: "insensitive" } },
      { contentId: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const cacheKey = `admin-votes:${searchParams.toString()}`;
  if (!fresh) {
    const cached = await getCached<{ ok: boolean; total: number; votes: any[] }>(
      cacheKey,
    );
    if (cached) return NextResponse.json(cached);
  }

  if (fresh) {
    const limitCheck = await checkRateLimit(req.headers, {
      keyPrefix: "refresh-admin-votes",
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
    lockKey = `lock:admin-votes:${searchParams.toString()}`;
    lockAcquired = await acquireLock(lockKey, 3000);
    if (!lockAcquired) {
      const cached = await getCached<{
        ok: boolean;
        total: number;
        votes: any[];
      }>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }
  }

  try {
    const votes = await prisma.vote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        contentId: true,
        timeSeconds: true,
        voteType: true,
        pageUrl: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    const total = await prisma.vote.count({ where });

    const payload = {
      ok: true,
      total,
      votes,
    };

    await setCached(cacheKey, payload, 15_000);
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
