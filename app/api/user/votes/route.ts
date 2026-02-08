import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/auth";
import {
  acquireLock,
  checkRateLimit,
  getCached,
  releaseLock,
  setCached,
} from "@/app/lib/publicCache";

export async function GET(req: Request) {
  const r = await requireUser(req);
  if (!r.ok) return r.res;

  const { searchParams } = new URL(req.url);
  const fresh =
    searchParams.get("fresh") === "1" ||
    req.headers.get("x-cache-bypass") === "1";

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const voteType = searchParams.get("voteType"); // UP | DOWN
  const contentId = searchParams.get("contentId");
  const q = searchParams.get("q"); // URL search
  const limit = Number(searchParams.get("limit") || 50);

  const where: any = {
    userId: r.user.id,
  };

  // Date filter
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  // Vote type
  if (voteType === "UP" || voteType === "DOWN") {
    where.voteType = voteType;
  }

  // Content filter
  if (contentId) {
    where.contentId = contentId;
  }

  // URL search
  if (q) {
    where.OR = [
      { pageUrl: { contains: q, mode: "insensitive" } },
      { contentId: { contains: q, mode: "insensitive" } },
    ];
  }

  const cacheKey = `user-votes:${r.user.id}:${searchParams.toString()}`;
  if (!fresh) {
    const cached = await getCached<{
      ok: boolean;
      total: number;
      votes: any[];
    }>(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  let lockAcquired = false;
  if (fresh) {
    const limitCheck = await checkRateLimit(req.headers, {
      keyPrefix: "refresh-user-votes",
      keySuffix: r.user.id,
      max: 30,
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
    lockAcquired = await acquireLock(`lock:user-votes:${r.user.id}`, 3000);
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
        pageHost: true,
        createdAt: true,
      },
    });

    const total = await prisma.vote.count({ where });

    const payload = { ok: true, total, votes };
    await setCached(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } finally {
    if (lockAcquired) {
      await releaseLock(`lock:user-votes:${r.user.id}`);
    }
  }
}
