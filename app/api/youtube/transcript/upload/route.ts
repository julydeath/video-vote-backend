import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import { TranscriptStatus } from "@/app/generated/prisma/enums";

type Seg = { start: number; dur: number; text: string };

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
    const rawContentId = body?.contentId;
    const contentId =
      typeof rawContentId === "string"
        ? decodeURIComponent(rawContentId)
        : null;

    const segments = body?.segments as Seg[] | undefined;

    if (!contentId || typeof contentId !== "string") {
      return NextResponse.json(
        { error: "contentId required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json(
        { error: "segments must be a non-empty array" },
        { status: 400 },
      );
    }

    // Basic validation (avoid huge junk)
    const clean = segments
      .filter(
        (s) =>
          s &&
          Number.isFinite(s.start) &&
          Number.isFinite(s.dur) &&
          typeof s.text === "string",
      )
      .map((s) => ({
        contentId,
        start: Math.max(0, Math.floor(s.start)),
        dur: Math.max(0, Math.floor(s.dur)),
        text: s.text.trim(),
      }))
      .filter((s) => s.text.length > 0)
      .slice(0, 20000); // safety cap

    await prisma.$transaction(async (tx) => {
      // If you want “latest only”, you can delete first. For now we keep + dedupe.
      await tx.transcriptSegment.createMany({
        data: clean,
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
      transcriptStatus: TranscriptStatus.FETCHED,
      total,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
