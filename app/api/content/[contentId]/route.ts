import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import { fetchYoutubeOEmbed } from "@/app/lib/youtubeMeta";

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
    const forceMeta =
      url.searchParams.get("force") === "1" ||
      req.headers.get("x-meta-refresh") === "1";

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
          //@ts-expect-error
          title: meta.title! || item?.title,
          //@ts-expect-error
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

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
