import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import { TranscriptStatus } from "@/app/generated/prisma/enums";
import { YoutubeTranscript } from "youtube-transcript-plus";

export const runtime = "nodejs";

function videoIdFromContentId(contentId: string) {
  if (!contentId?.startsWith("yt:")) return null;
  const vid = contentId.slice(3).trim();
  return vid || null;
}

type Seg = { start: number; dur: number; text: string };

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing Bearer token" },
        { status: 401 },
      );
    }

    // validate token (and optionally ensure user exists)
    await getGoogleUserFromAccessToken(token);

    const body = await req.json().catch(() => null);
    const contentId = body?.contentId as string | undefined;

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

    const videoId = videoIdFromContentId(contentId);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid contentId" }, { status: 400 });
    }

    // already fetched?
    const existing = await prisma.transcriptSegment.count({
      where: { contentId },
    });
    if (existing > 0) {
      return NextResponse.json({
        ok: true,
        alreadyFetched: true,
        contentId,
        total: existing,
      });
    }

    // Try fetch transcript (server-side)
    // If you want a specific language, pass { lang: "en" } etc.
    // Docs: YoutubeTranscript.fetchTranscript(videoIdOrUrl, options)
    let items: { text: string; offset: number; duration: number }[] = [];
    try {
      items = (await YoutubeTranscript.fetchTranscript(videoId)) as any;
    } catch (e: any) {
      await prisma.content.upsert({
        where: { contentId },
        update: {
          transcriptStatus: TranscriptStatus.NONE,
          transcriptError: e?.message || "Transcript fetch failed",
        },
        create: {
          contentId,
          source: "youtube",
          transcriptStatus: TranscriptStatus.NONE,
          transcriptError: e?.message || "Transcript fetch failed",
        },
      });

      return NextResponse.json(
        { ok: false, error: e?.message || "Transcript fetch failed" },
        { status: 502 },
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      await prisma.content.upsert({
        where: { contentId },
        update: {
          transcriptStatus: TranscriptStatus.NONE,
          transcriptError: "No transcript returned",
        },
        create: {
          contentId,
          source: "youtube",
          transcriptStatus: TranscriptStatus.NONE,
          transcriptError: "No transcript returned",
        },
      });

      return NextResponse.json(
        { ok: false, error: "No transcript returned" },
        { status: 404 },
      );
    }

    // Convert to your segments shape (seconds)
    const clean: Seg[] = items
      .map((it) => ({
        start: Math.max(0, Math.floor(Number(it.offset) || 0)),
        dur: Math.max(0, Math.floor(Number(it.duration) || 0)),
        text: String(it.text || "")
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .filter((s) => s.text.length > 0)
      .slice(0, 20000);

    await prisma.$transaction(async (tx) => {
      await tx.transcriptSegment.createMany({
        data: clean.map((s) => ({
          contentId,
          start: s.start,
          dur: s.dur,
          text: s.text,
        })),
        skipDuplicates: true,
      });

      await tx.content.upsert({
        where: { contentId },
        update: {
          transcriptStatus: TranscriptStatus.FETCHED,
          transcriptFetchedAt: new Date(),
          transcriptError: null,
        },
        create: {
          contentId,
          source: "youtube",
          transcriptStatus: TranscriptStatus.FETCHED,
          transcriptFetchedAt: new Date(),
          transcriptError: null,
        },
      });
    });

    const total = await prisma.transcriptSegment.count({
      where: { contentId },
    });

    return NextResponse.json({
      ok: true,
      contentId,
      inserted: clean.length,
      total,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
