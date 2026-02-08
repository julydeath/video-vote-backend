import { getCached, setCached } from "@/app/lib/publicCache";

export type YoutubeMeta = {
  title: string | null;
  channelName: string | null;
};

export async function fetchYoutubeOEmbed(
  videoId: string,
  opts?: { force?: boolean },
): Promise<YoutubeMeta> {
  const cacheKey = `ytmeta:${videoId}`;
  if (!opts?.force) {
    const cached = await getCached<YoutubeMeta>(cacheKey);
    if (cached) return cached;
  }

  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { title: null, channelName: null };
    }
    const data = (await res.json()) as any;
    const payload = {
      title: typeof data?.title === "string" ? data.title : null,
      channelName: typeof data?.author_name === "string" ? data.author_name : null,
    };
    await setCached(cacheKey, payload, 24 * 60 * 60 * 1000);
    return payload;
  } catch {
    return { title: null, channelName: null };
  }
}
