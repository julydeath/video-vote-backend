import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { VoteType } from "@/app/generated/prisma/enums";
import { checkRateLimit, getCached, setCached } from "@/app/lib/publicCache";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  try {
    const limitCheck = await checkRateLimit(req.headers, {
      keyPrefix: "public-summary",
      max: 120,
      windowMs: 60_000,
    });
    if (!limitCheck.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(limitCheck.retryAfter) } },
      );
    }

    const contentId = decodeURIComponent((await params).contentId);
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50);

    const cacheKey = `summary:${contentId}:${limit}`;
    const cached = await getCached<{ ok: boolean; contentId: string }>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const grouped = await prisma.vote.groupBy({
      by: ["timeBucket", "voteType"],
      where: { contentId },
      _count: { _all: true },
      orderBy: [{ timeBucket: "asc" }],
    });

    const map: Record<number, { up: number; down: number }> = {};
    for (const row of grouped) {
      const tb = row.timeBucket;
      if (!map[tb]) map[tb] = { up: 0, down: 0 };
      if (row.voteType === VoteType.UP) map[tb].up = row._count._all;
      if (row.voteType === VoteType.DOWN) map[tb].down = row._count._all;
    }

    const buckets = Object.entries(map).map(([timeBucket, v]) => ({
      timeBucket: Number(timeBucket),
      up: v.up,
      down: v.down,
      score: v.up - v.down,
      total: v.up + v.down,
    }));

    const topUp = [...buckets]
      .sort((a, b) => b.up - a.up || b.total - a.total)
      .slice(0, limit);

    const [maxVote, lastSegment] = await Promise.all([
      prisma.vote.aggregate({
        where: { contentId },
        _max: { timeSeconds: true },
      }),
      prisma.transcriptSegment.findFirst({
        where: { contentId },
        orderBy: { start: "desc" },
        select: { start: true, dur: true },
      }),
    ]);

    const transcriptDuration = lastSegment
      ? Math.max(0, lastSegment.start + (lastSegment.dur || 0))
      : null;

    const durationSeconds = transcriptDuration ?? maxVote._max.timeSeconds ?? 0;

    const totals = await prisma.vote.groupBy({
      by: ["voteType"],
      where: { contentId },
      _count: { _all: true },
    });

    const totalMap = { up: 0, down: 0 };
    for (const t of totals) {
      if (t.voteType === VoteType.UP) totalMap.up = t._count._all;
      if (t.voteType === VoteType.DOWN) totalMap.down = t._count._all;
    }

    const payload = {
      ok: true,
      contentId,
      durationSeconds,
      totals: {
        up: totalMap.up,
        down: totalMap.down,
        total: totalMap.up + totalMap.down,
      },
      buckets,
      topUp,
    };

    await setCached(cacheKey, payload, 60_000);
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
