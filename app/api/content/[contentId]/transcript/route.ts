// app/api/content/[contentId]/transcript/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";

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

    const segments = await prisma.transcriptSegment.findMany({
      where: { contentId },
      orderBy: { start: "asc" },
      select: {
        start: true,
        dur: true,
        text: true,
      },
    });

    return NextResponse.json({
      ok: true,
      contentId,
      segments,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
