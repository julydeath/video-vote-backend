import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { checkRateLimit, getCached, setCached } from "@/app/lib/publicCache";

function videoIdFromContentId(contentId: string) {
  if (!contentId?.startsWith("yt:")) return null;
  const vid = contentId.slice(3).trim();
  return vid || null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  try {
    const limit = await checkRateLimit(req.headers, {
      keyPrefix: "public-meta",
      max: 180,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const contentId = decodeURIComponent((await params).contentId);
    const cacheKey = `meta:${contentId}`;
    const cached = await getCached<{ ok: boolean; item: any }>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const item = await prisma.content.findUnique({
      where: { contentId },
      select: {
        contentId: true,
        source: true,
        title: true,
        channelName: true,
        pageUrl: true,
        pageHost: true,
        transcriptStatus: true,
        updatedAt: true,
      },
    });

    const lastSegment = await prisma.transcriptSegment.findFirst({
      where: { contentId },
      orderBy: { start: "desc" },
      select: { start: true, dur: true },
    });

    const durationSeconds = lastSegment
      ? Math.max(0, lastSegment.start + (lastSegment.dur || 0))
      : null;

    const videoId = videoIdFromContentId(contentId);
    const thumbnailUrl = videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : null;

    const payload = {
      ok: true,
      item: {
        ...item,
        durationSeconds,
        thumbnailUrl,
      },
    };

    await setCached(cacheKey, payload, 5 * 60_000);
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
