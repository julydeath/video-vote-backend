import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { VoteType } from "@/app/generated/prisma/enums";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ contentId: string }> },
) {
  try {
    const contentId = (await params).contentId;
    if (!contentId)
      return NextResponse.json(
        { error: "contentId required" },
        { status: 400 },
      );

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50);

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
      const count = row._count._all;
      if (row.voteType === VoteType.UP) map[tb].up = count;
      if (row.voteType === VoteType.DOWN) map[tb].down = count;
    }

    const buckets = Object.entries(map).map(([timeBucket, v]) => ({
      timeBucket: Number(timeBucket),
      up: v.up,
      down: v.down,
      score: v.up - v.down,
    }));

    const topUp = [...buckets].sort((a, b) => b.up - a.up).slice(0, limit);

    return NextResponse.json({ ok: true, contentId, topUp });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
