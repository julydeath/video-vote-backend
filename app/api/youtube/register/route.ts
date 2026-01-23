import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import { TranscriptStatus } from "@/app/generated/prisma/enums";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token)
      return NextResponse.json(
        { error: "Missing Bearer token" },
        { status: 401 },
      );

    await getGoogleUserFromAccessToken(token);

    const body = await req.json().catch(() => null);

    const contentId = body?.contentId;
    const baseUrl = body?.captionBaseUrl || null;
    const captionLanguage = body?.captionLanguage || null;
    const captionIsAuto = body?.captionIsAuto ?? null;

    const title = body?.title || null;
    const channelName = body?.channelName || null;
    const pageUrl = body?.pageUrl || null;
    const pageHost = body?.pageHost || null;

    if (
      !contentId ||
      typeof contentId !== "string" ||
      !contentId.startsWith("yt:")
    ) {
      return NextResponse.json(
        { error: "contentId must be like yt:VIDEOID" },
        { status: 400 },
      );
    }

    // If we already have segments, no need to fetch again
    const segCount = await prisma.transcriptSegment.count({
      where: { contentId },
    });

    const content = await prisma.content.upsert({
      where: { contentId },
      update: {
        source: "youtube",
        title,
        channelName,
        pageUrl,
        pageHost,
        captionBaseUrl: baseUrl,
        captionLanguage,
        captionIsAuto,
        transcriptStatus:
          segCount > 0 ? TranscriptStatus.FETCHED : TranscriptStatus.NONE,
      },
      create: {
        contentId,
        source: "youtube",
        title,
        channelName,
        pageUrl,
        pageHost,
        captionBaseUrl: baseUrl,
        captionLanguage,
        captionIsAuto,
        transcriptStatus:
          segCount > 0 ? TranscriptStatus.FETCHED : TranscriptStatus.NONE,
      },
    });

    return NextResponse.json({
      ok: true,
      contentId,
      alreadyFetched: segCount > 0,
      segments: segCount,
      hasCaptionTrack: !!baseUrl,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
