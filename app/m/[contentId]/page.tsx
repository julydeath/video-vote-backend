import { Metadata } from "next";
import { headers } from "next/headers";

type MetaResponse = {
  ok: boolean;
  item: {
    contentId: string;
    title?: string | null;
    channelName?: string | null;
    pageUrl?: string | null;
    pageHost?: string | null;
    durationSeconds?: number | null;
    thumbnailUrl?: string | null;
  } | null;
};

type SummaryResponse = {
  ok: boolean;
  contentId: string;
  durationSeconds: number;
  totals: { up: number; down: number; total: number };
  buckets: { timeBucket: number; up: number; down: number; total: number }[];
  topUp: { timeBucket: number; up: number; down: number; total: number }[];
};

type SnippetResponse = {
  ok: boolean;
  range: { start: number; end: number };
  segments: { start: number; dur: number; text: string }[];
};

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  const h = headers();
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

async function fetchMeta(contentId: string): Promise<MetaResponse | null> {
  const baseUrl = getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/public/content/${encodeURIComponent(contentId)}/meta`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return (await res.json()) as MetaResponse;
}

async function fetchSummary(
  contentId: string,
): Promise<SummaryResponse | null> {
  const baseUrl = getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/public/content/${encodeURIComponent(
      contentId,
    )}/summary?limit=10`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return (await res.json()) as SummaryResponse;
}

async function fetchSnippet(
  contentId: string,
  center: number,
): Promise<SnippetResponse | null> {
  const baseUrl = getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/public/content/${encodeURIComponent(
      contentId,
    )}/snippet?center=${center}&window=8`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return (await res.json()) as SnippetResponse;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ contentId: string }>;
}): Promise<Metadata> {
  const contentId = decodeURIComponent((await params).contentId);
  const meta = await fetchMeta(contentId);
  const baseUrl = getBaseUrl();
  const pageUrl = `${baseUrl}/m/${encodeURIComponent(contentId)}`;
  const title = meta?.item?.title || "Top Moments";
  const description = meta?.item?.channelName
    ? `Top voted moments for ${meta.item.channelName}`
    : "Top voted moments and highlights";
  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: meta?.item?.thumbnailUrl ? [meta.item.thumbnailUrl] : [],
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      images: meta?.item?.thumbnailUrl ? [meta.item.thumbnailUrl] : [],
    },
  };
}

export default async function PublicMomentsPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const contentId = decodeURIComponent((await params).contentId);
  const [meta, summary] = await Promise.all([
    fetchMeta(contentId),
    fetchSummary(contentId),
  ]);

  const item = meta?.item || null;
  const totals = summary?.totals || { up: 0, down: 0, total: 0 };
  const duration = summary?.durationSeconds || 0;
  const top = summary?.topUp || [];
  const extensionUrl =
    process.env.NEXT_PUBLIC_EXTENSION_URL ||
    "https://chromewebstore.google.com/";

  const snippets = await Promise.all(
    top.map((t) => fetchSnippet(contentId, t.timeBucket)),
  );

  return (
    <div className="app-shell px-6 py-10 md:px-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap gap-6 items-center justify-between">
          <div>
            <div className="text-sm text-[var(--muted)]">Top Moments</div>
            <h1 className="text-3xl font-semibold">
              {item?.title || contentId}
            </h1>
            <p className="text-[var(--muted)] mt-2">
              {item?.channelName || item?.pageHost || "Community reactions"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="chip badge-up">▲ {totals.up}</span>
            <span className="chip badge-down">▼ {totals.down}</span>
            <span className="chip">Duration {fmtTime(duration)}</span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
          <div className="glass-panel p-6">
            <div className="section-title">Reaction Heatmap</div>
            <div className="mt-4 timeline-track">
              {summary?.buckets?.map((b) => {
                const maxTime = Math.max(duration || 0, 10);
                const left = Math.min(
                  100,
                  Math.max(0, (b.timeBucket / maxTime) * 100),
                );
                const voteType = b.up >= b.down ? "UP" : "DOWN";
                return (
                  <span
                    key={b.timeBucket}
                    className={`timeline-marker ${
                      voteType === "UP" ? "up" : "down"
                    }`}
                    style={{ left: `${left}%` }}
                    title={`${fmtTime(b.timeBucket)} (${b.total})`}
                  >
                    {voteType === "UP" ? "▲" : "▼"}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
              <span>0:00</span>
              <span>{fmtTime(duration)}</span>
            </div>

            {item?.thumbnailUrl && (
              <div className="mt-6 rounded-2xl overflow-hidden border border-white/10">
                <img
                  src={item.thumbnailUrl}
                  alt={item?.title || "Video thumbnail"}
                  className="w-full h-52 object-cover"
                />
              </div>
            )}
          </div>

          <div className="panel-strong p-6">
            <div className="section-title">Top Moments</div>
            <div className="mt-4 space-y-3">
              {top.length === 0 && (
                <div className="text-[var(--muted)]">No votes yet.</div>
              )}
              {top.map((t, idx) => {
                const snip = snippets[idx];
                return (
                  <div key={t.timeBucket} className="reaction-row">
                    <div>
                      <div className="text-sm font-semibold">
                        {fmtTime(t.timeBucket)}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        ▲ {t.up} • ▼ {t.down}
                      </div>
                      {snip?.segments?.length ? (
                        <div className="mt-2 text-xs text-[var(--muted)]">
                          {snip.segments
                            .slice(0, 2)
                            .map((s) => s.text)
                            .join(" ")}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-[var(--muted)]">
                          Transcript unavailable
                        </div>
                      )}
                    </div>
                    <a
                      className="text-xs text-[var(--accent-2)]"
                      href={
                        item?.pageUrl && item.pageUrl.startsWith("http")
                          ? `${item.pageUrl}&t=${t.timeBucket}s`
                          : "#"
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 text-xs text-[var(--muted)]">
              Want to add your reaction? Install the extension.
            </div>
            <a
              href={extensionUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-xl border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/20 text-sm font-medium"
            >
              Get the Extension
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
