export type TranscriptSegment = {
  start: number; // seconds
  dur: number; // seconds
  text: string;
};

export async function fetchTranscriptJson3(
  baseUrl: string,
): Promise<TranscriptSegment[]> {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Transcript fetch failed: ${res.status} ${t}`);
  }

  const data: any = await res.json();

  const segments = (data.events || [])
    .filter((e: any) => e.segs && typeof e.tStartMs === "number")
    .map((e: any) => {
      const text = (e.segs || [])
        .map((s: any) => s.utf8 || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();

      return {
        start: Math.floor(e.tStartMs / 1000),
        dur: Math.floor((e.dDurationMs || 0) / 1000),
        text,
      };
    })
    .filter((s: any) => s.text);

  return segments;
}
