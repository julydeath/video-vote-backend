import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { VoteType } from "@/app/generated/prisma/enums";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const videoId = (await params).videoId;
    if (!videoId) {
      return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50);
    const bucketSize = Number(url.searchParams.get("bucketSize") || 5);

    // Group by timeBucket and voteType and count votes
    const grouped = await prisma.vote.groupBy({
      by: ["timeBucket", "voteType"],
      where: { videoId },
      _count: { _all: true },
      orderBy: [{ timeBucket: "asc" }],
    });

    // Convert to a bucket map: timeBucket -> { up, down }
    const map: Record<number, { up: number; down: number }> = {};
    for (const row of grouped) {
      const tb = row.timeBucket;
      if (!map[tb]) map[tb] = { up: 0, down: 0 };
      const count = row._count._all;
      if (row.voteType === VoteType.UP) map[tb].up = count;
      if (row.voteType === VoteType.DOWN) map[tb].down = count;
    }

    const buckets = Object.entries(map)
      .map(([timeBucket, v]) => ({
        timeBucket: Number(timeBucket),
        up: v.up,
        down: v.down,
        score: v.up - v.down,
      }))
      .sort((a, b) => b.up - a.up);

    const topUp = [...buckets].sort((a, b) => b.up - a.up).slice(0, limit);
    const topDown = [...buckets]
      .sort((a, b) => b.down - a.down)
      .slice(0, limit);
    const topScore = [...buckets]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json({
      ok: true,
      videoId,
      bucketSize,
      topUp,
      topDown,
      topScore,
      // Optional: include full distribution if you want later:
      // buckets: buckets.sort((a,b)=>a.timeBucket-b.timeBucket)
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
