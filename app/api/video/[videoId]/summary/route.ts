import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;

  // map old API to new key
  const contentId = `yt:${decodeURIComponent(videoId)}`;

  const grouped = await prisma.vote.groupBy({
    by: ["timeBucket", "voteType"],
    where: { contentId }, // ✅ FIX
    _count: { _all: true },
    orderBy: [{ timeBucket: "asc" }],
  });

  // format into buckets
  const map = new Map<
    number,
    { timeBucket: number; up: number; down: number }
  >();
  for (const g of grouped) {
    const bucket = g.timeBucket;
    const row = map.get(bucket) || { timeBucket: bucket, up: 0, down: 0 };
    if (g.voteType === "UP") row.up = g._count._all;
    if (g.voteType === "DOWN") row.down = g._count._all;
    map.set(bucket, row);
  }

  const topUp = Array.from(map.values())
    .sort((a, b) => b.up - a.up)
    .slice(0, 10);

  return NextResponse.json({ ok: true, contentId, topUp });
}
