import { NextResponse } from "next/server";

import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import prisma from "@/app/lib/prisma";
import { VoteType } from "@/app/generated/prisma/enums";

function toBucket(seconds: number, bucketSize = 5) {
  return Math.floor(seconds / bucketSize) * bucketSize;
}

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

    // ✅ parse body first
    const body = await req.json().catch(() => null);

    // ✅ support new generic field + fallback for old youtube-only payload
    const contentId =
      body?.contentId || (body?.videoId ? `yt:${body.videoId}` : null);

    const pageUrl = body?.pageUrl ?? null;
    const pageHost = body?.pageHost ?? null;

    const timeSecondsRaw = body?.timeSeconds;
    const vote = body?.vote;

    if (!contentId || typeof contentId !== "string") {
      return NextResponse.json(
        { error: "contentId required" },
        { status: 400 },
      );
    }

    if (
      typeof timeSecondsRaw !== "number" ||
      !Number.isFinite(timeSecondsRaw)
    ) {
      return NextResponse.json(
        { error: "timeSeconds must be a number" },
        { status: 400 },
      );
    }

    if (vote !== "UP" && vote !== "DOWN") {
      return NextResponse.json(
        { error: "vote must be UP or DOWN" },
        { status: 400 },
      );
    }

    const timeSeconds = Math.max(0, Math.floor(timeSecondsRaw));
    const timeBucket = toBucket(timeSeconds, 5);

    // Verify Google user
    const googleUser = await getGoogleUserFromAccessToken(token);

    // Upsert user
    const user = await prisma.user.upsert({
      where: { googleSub: googleUser.sub },
      update: {
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.picture,
      },
      create: {
        googleSub: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.picture,
      },
    });

    // ✅ Upsert vote using contentId (not videoId)
    const saved = await prisma.vote.upsert({
      where: {
        userId_contentId_timeBucket: {
          userId: user.id,
          contentId,
          timeBucket,
        },
      },
      update: {
        voteType: vote as VoteType,
        timeSeconds,
        pageUrl,
        pageHost,
      },
      create: {
        userId: user.id,
        contentId,
        timeSeconds,
        timeBucket,
        voteType: vote as VoteType,
        pageUrl,
        pageHost,
      },
    });

    return NextResponse.json({
      ok: true,
      saved: {
        id: saved.id,
        contentId: saved.contentId,
        timeSeconds: saved.timeSeconds,
        timeBucket: saved.timeBucket,
        voteType: saved.voteType,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
