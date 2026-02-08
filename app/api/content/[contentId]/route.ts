import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import {
  acquireLock,
  checkRateLimit,
  getCached,
  releaseLock,
  setCached,
} from "@/app/lib/publicCache";
import { fetchYoutubeOEmbed } from "@/app/lib/youtubeMeta";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  let lockAcquired = false;
  let lockKey = "";
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const googleUser = await getGoogleUserFromAccessToken(token);

    const contentId = decodeURIComponent((await params).contentId);
    const url = new URL(req.url);
    const fresh =
      url.searchParams.get("fresh") === "1" ||
      req.headers.get("x-cache-bypass") === "1";
    const forceMeta =
      url.searchParams.get("force") === "1" ||
      req.headers.get("x-meta-refresh") === "1";

    const cacheKey = `content-detail:${contentId}`;
    if (!fresh) {
      const cached = await getCached<{ ok: boolean; item: any }>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    if (fresh) {
      const limitCheck = await checkRateLimit(req.headers, {
        keyPrefix: "refresh-content-detail",
        keySuffix: googleUser.sub,
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
      lockKey = `lock:content-detail:${contentId}`;
      lockAcquired = await acquireLock(lockKey, 3000);
      if (!lockAcquired) {
        const cached = await getCached<{ ok: boolean; item: any }>(cacheKey);
        if (cached) return NextResponse.json(cached);
      }
    }

    const item = await prisma.content.findUnique({
      where: { contentId },
      select: {
        contentId: true,
        source: true,
        title: true,
        channelName: true,
        pageUrl: true,
        pageHost: true,
        captionLanguage: true,
        transcriptStatus: true,
        transcriptFetchedAt: true,
        updatedAt: true,
      },
    });

    let resolved = item;
    if (contentId.startsWith("yt:") && (forceMeta || !item?.title)) {
      const videoId = contentId.slice(3);
      const meta = await fetchYoutubeOEmbed(videoId, { force: forceMeta });
      if (meta.title || meta.channelName) {
        await prisma.content.update({
          where: { contentId },
          data: {
            title: meta.title || item?.title,
            channelName: meta.channelName || item?.channelName,
          },
        });
        resolved = {
          ...item,
          title: meta.title || item?.title,
          channelName: meta.channelName || item?.channelName,
        };
      }
    }

    const lastSegment = await prisma.transcriptSegment.findFirst({
      where: { contentId },
      orderBy: { start: "desc" },
      select: { start: true, dur: true },
    });

    const durationSeconds = lastSegment
      ? Math.max(0, lastSegment.start + (lastSegment.dur || 0))
      : null;

    const payload = {
      ok: true,
      item: {
        ...resolved,
        durationSeconds,
      },
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
