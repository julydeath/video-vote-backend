import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import { VoteType } from "@/app/generated/prisma/enums";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return { ok: false as const, status: 401, error: "Missing Bearer token" };
  }

  const googleUser = await getGoogleUserFromAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { googleSub: googleUser.sub },
    select: { id: true, role: true },
  });

  if (!user) {
    return { ok: false as const, status: 401, error: "User not found" };
  }

  if (user.role !== "ADMIN") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ contentId: string }> },
) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status },
      );
    }

    const { contentId } = await context.params;
    const decodedContentId = decodeURIComponent(contentId);

    const grouped = await prisma.vote.groupBy({
      by: ["timeBucket", "voteType"],
      where: { contentId: decodedContentId },
      _count: { _all: true },
      orderBy: [{ timeBucket: "asc" }],
    });

    const buckets: Record<number, { up: number; down: number }> = {};
    for (const row of grouped) {
      const tb = row.timeBucket;
      if (!buckets[tb]) buckets[tb] = { up: 0, down: 0 };
      if (row.voteType === VoteType.UP) buckets[tb].up = row._count._all;
      if (row.voteType === VoteType.DOWN) buckets[tb].down = row._count._all;
    }

    const timeline = Object.entries(buckets).map(([timeBucket, v]) => ({
      timeBucket: Number(timeBucket),
      up: v.up,
      down: v.down,
    }));

    const [maxVote, lastSegment] = await Promise.all([
      prisma.vote.aggregate({
        where: { contentId: decodedContentId },
        _max: { timeSeconds: true },
      }),
      prisma.transcriptSegment.findFirst({
        where: { contentId: decodedContentId },
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
      where: { contentId: decodedContentId },
      _count: { _all: true },
    });

    const totalMap = { up: 0, down: 0 };
    for (const t of totals) {
      if (t.voteType === VoteType.UP) totalMap.up = t._count._all;
      if (t.voteType === VoteType.DOWN) totalMap.down = t._count._all;
    }

    const payload = {
      ok: true,
      contentId: decodedContentId,
      totals: {
        up: totalMap.up,
        down: totalMap.down,
        total: totalMap.up + totalMap.down,
      },
      durationSeconds,
      timeline,
    };

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
