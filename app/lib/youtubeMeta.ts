export type YoutubeMeta = {
  title: string | null;
  channelName: string | null;
};

export async function fetchYoutubeOEmbed(
  videoId: string,
  _opts?: { force?: boolean },
): Promise<YoutubeMeta> {
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
    return payload;
  } catch {
    return { title: null, channelName: null };
  }
}
