import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await getGoogleUserFromAccessToken(token);

    const contentId = decodeURIComponent((await params).contentId);
    const url = new URL(req.url);
    const center = Number(url.searchParams.get("center"));
    const windowSec = clampNumber(
      Number(url.searchParams.get("window") || 8),
      2,
      60,
    );

    if (!Number.isFinite(center)) {
      return NextResponse.json(
        { error: "center must be a number" },
        { status: 400 },
      );
    }

    const startRange = Math.max(0, Math.floor(center - windowSec));
    const endRange = Math.max(0, Math.floor(center + windowSec));
    const lowerBound = Math.max(0, startRange - 30);

    const segments = await prisma.transcriptSegment.findMany({
      where: {
        contentId,
        start: {
          gte: lowerBound,
          lte: endRange,
        },
      },
      orderBy: { start: "asc" },
      select: {
        start: true,
        dur: true,
        text: true,
      },
      take: 120,
    });

    const filtered = segments
      .filter((s) => s.start + (s.dur || 0) >= startRange)
      .slice(0, 80);

    return NextResponse.json({
      ok: true,
      contentId,
      center,
      window: windowSec,
      range: { start: startRange, end: endRange },
      segments: filtered,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
