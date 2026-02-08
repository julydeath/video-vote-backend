"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Vote = {
  id: string;
  contentId: string;
  timeSeconds: number;
  voteType: "UP" | "DOWN";
  pageUrl?: string | null;
  pageHost?: string | null;
  createdAt: string;
};

type TranscriptSegment = {
  start: number;
  dur: number;
  text: string;
};

type ContentMeta = {
  contentId: string;
  source?: string | null;
  title?: string | null;
  channelName?: string | null;
  pageUrl?: string | null;
  pageHost?: string | null;
  transcriptStatus?: string | null;
  durationSeconds?: number | null;
};

type ContentRow = {
  contentId: string;
  pageUrl?: string | null;
  pageHost?: string | null;
  up: number;
  down: number;
  total: number;
  lastVotedAt?: string;
  maxTime: number;
  votes: Vote[];
  platform: string;
};

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtShortDate(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function fmtClock(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function getVideoId(contentId: string) {
  if (!contentId?.startsWith("yt:")) return null;
  const id = contentId.slice(3).trim();
  return id || null;
}

function getThumbnailUrl(contentId: string) {
  const vid = getVideoId(contentId);
  if (!vid) return null;
  return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
}

function getHostFromUrl(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host.replace("www.", "");
  } catch {
    return null;
  }
}

function getPlatformLabel(contentId: string, pageHost?: string | null) {
  const host = (pageHost || "").toLowerCase();
  if (contentId.startsWith("yt:") || host.includes("youtube")) return "YouTube";
  if (host.includes("vimeo")) return "Vimeo";
  if (host.includes("loom")) return "Loom";
  if (host.includes("twitch")) return "Twitch";
  if (host.includes("facebook")) return "Facebook";
  if (host.includes("tiktok")) return "TikTok";
  if (host) return host.replace("www.", "");
  return "Web";
}

function getOpenUrl(contentId: string, pageUrl?: string | null) {
  if (pageUrl) return pageUrl;
  if (contentId.startsWith("yt:")) {
    const vid = contentId.slice(3);
    return `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`;
  }
  return "#";
}

function buildDayBuckets(votes: Vote[]) {
  const now = new Date();
  const buckets = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return { date: d, count: 0 };
  });

  for (const v of votes) {
    const d = new Date(v.createdAt);
    d.setHours(0, 0, 0, 0);
    const idx = buckets.findIndex((b) => b.date.getTime() === d.getTime());
    if (idx >= 0) buckets[idx].count += 1;
  }

  return buckets;
}

export default function UserDashboard({ token }: { token: string }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [voteType, setVoteType] = useState("");
  const [platform, setPlatform] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [openVoteId, setOpenVoteId] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<
    Record<
      string,
      {
        loading: boolean;
        error?: string;
        segments?: TranscriptSegment[];
        range?: { start: number; end: number };
      }
    >
  >({});
  const [contentMeta, setContentMeta] = useState<Record<string, ContentMeta>>(
    {},
  );
  const [reactionPage, setReactionPage] = useState(1);
  const reactionsPerPage = 5;
  const [videoPage, setVideoPage] = useState(1);
  const videosPerPage = 5;
  const selectDebounceRef = useRef<number | null>(null);
  const selectionDelayMs = 2000;
  const [shareCopied, setShareCopied] = useState(false);
  const detailBypassRef = useRef(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [metaRefreshTick, setMetaRefreshTick] = useState(0);

  const contentRows = useMemo(() => {
    const map = new Map<string, ContentRow>();
    for (const v of votes) {
      const row = map.get(v.contentId) || {
        contentId: v.contentId,
        pageUrl: v.pageUrl || null,
        pageHost: v.pageHost || null,
        up: 0,
        down: 0,
        total: 0,
        lastVotedAt: v.createdAt,
        maxTime: 0,
        votes: [],
        platform: getPlatformLabel(v.contentId, v.pageHost || null),
      };

      row.total += 1;
      if (v.voteType === "UP") row.up += 1;
      if (v.voteType === "DOWN") row.down += 1;
      row.maxTime = Math.max(row.maxTime, v.timeSeconds || 0);
      if (!row.pageUrl && v.pageUrl) row.pageUrl = v.pageUrl;
      if (!row.pageHost && v.pageHost) row.pageHost = v.pageHost;
      if (v.createdAt > (row.lastVotedAt || "")) row.lastVotedAt = v.createdAt;
      row.votes.push(v);
      map.set(v.contentId, row);
    }

    const rows = Array.from(map.values()).sort((a, b) => {
      return String(b.lastVotedAt || "").localeCompare(
        String(a.lastVotedAt || ""),
      );
    });

    if (platform === "All") return rows;
    return rows.filter((r) => r.platform === platform);
  }, [votes, platform]);

  const activeId = pendingId || selectedId;

  const detailQuery = useQuery({
    queryKey: ["contentDetail", selectedId, token],
    enabled: Boolean(selectedId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (detailBypassRef.current) {
        headers["x-cache-bypass"] = "1";
        detailBypassRef.current = false;
      }
      const res = await fetch(
        `/api/content/${encodeURIComponent(selectedId!)}`,
        { headers },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load content");
      return (json?.item || null) as ContentMeta | null;
    },
  });

  useEffect(() => {
    if (!detailQuery.data?.contentId) return;
    setContentMeta((prev) => ({
      ...prev,
      [detailQuery.data!.contentId]: detailQuery.data!,
    }));
  }, [detailQuery.data]);

  const selected = useMemo(() => {
    if (!activeId) return null;
    return contentRows.find((r) => r.contentId === activeId) || null;
  }, [activeId, contentRows]);

  function getMeta(contentId: string) {
    return contentMeta[contentId];
  }

  const selectedMeta = selected
    ? detailQuery.data?.contentId === selected.contentId
      ? detailQuery.data
      : getMeta(selected.contentId)
    : null;
  const durationSeconds =
    typeof selectedMeta?.durationSeconds === "number" &&
    Number.isFinite(selectedMeta.durationSeconds) &&
    selectedMeta.durationSeconds > 0
      ? selectedMeta.durationSeconds
      : selected?.maxTime || 0;
  const isRefreshing =
    detailQuery.isFetching && Boolean(detailQuery.data?.contentId);
  const isDetailLoading =
    (pendingId && pendingId !== selectedId) ||
    (detailQuery.isFetching && !detailQuery.data);

  const dailyBuckets = useMemo(() => buildDayBuckets(votes), [votes]);

  const platformCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of contentRows) {
      map.set(row.platform, (map.get(row.platform) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [contentRows]);

  const platforms = ["All", ...new Set(contentRows.map((r) => r.platform))];

  async function loadVotes(bypass = false) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (voteType) params.set("voteType", voteType);
      if (q) params.set("q", q);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59").toISOString());

      if (bypass) params.set("fresh", "1");

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (bypass) headers["x-cache-bypass"] = "1";

      const res = await fetch(`/api/user/votes?${params.toString()}`, {
        headers,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load votes");
      }

      const rows = (json?.votes || []) as Vote[];
      setVotes(rows);

      if (rows.length && !selectedId) {
        setSelectedId(rows[0].contentId);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load votes");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (refreshCooldown) return;
    setRefreshCooldown(true);
    window.setTimeout(() => setRefreshCooldown(false), 5000);
    await loadVotes(true);
    setMetaRefreshTick((t) => t + 1);
    if (selectedId) {
      detailBypassRef.current = true;
      detailQuery.refetch();
    }
  }

  useEffect(() => {
    loadVotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (contentRows.length === 0) {
      setSelectedId(null);
      setPendingId(null);
      return;
    }
    if (!selectedId || !contentRows.find((r) => r.contentId === selectedId)) {
      setSelectedId(contentRows[0].contentId);
    }
  }, [contentRows, selectedId]);

  useEffect(() => {
    setOpenVoteId(null);
    setReactionPage(1);
    setShareCopied(false);
  }, [selectedId]);

  useEffect(() => {
    setOpenVoteId(null);
  }, [reactionPage]);

  useEffect(() => {
    setVideoPage(1);
  }, [platform, voteType, q, from, to]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(contentRows.length / videosPerPage),
    );
    if (videoPage > totalPages) setVideoPage(1);
  }, [contentRows.length, videoPage]);

  useEffect(() => {
    const ids = Array.from(new Set(votes.map((v) => v.contentId)));
    if (ids.length === 0) return;

    const force = metaRefreshTick > 0;
    fetch(`/api/content/lookup${force ? "?force=1" : ""}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(force ? { "x-meta-refresh": "1" } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contentIds: ids }),
    })
      .then((r) => r.json())
      .then((j) => {
        const items = (j?.items || []) as ContentMeta[];
        if (items.length === 0) return;
        setContentMeta((prev) => {
          const next = { ...prev };
          for (const item of items) {
            next[item.contentId] = item;
          }
          return next;
        });
      })
      .catch(() => null);
  }, [votes, token, metaRefreshTick]);

  useEffect(() => {
    if (!pendingId) return;
    if (selectDebounceRef.current) {
      window.clearTimeout(selectDebounceRef.current);
    }
    selectDebounceRef.current = window.setTimeout(() => {
      setSelectedId(pendingId);
      setPendingId(null);
    }, selectionDelayMs);
    return () => {
      if (selectDebounceRef.current) {
        window.clearTimeout(selectDebounceRef.current);
      }
    };
  }, [pendingId]);

  const stats = useMemo(() => {
    const total = votes.length;
    const up = votes.filter((v) => v.voteType === "UP").length;
    const down = votes.filter((v) => v.voteType === "DOWN").length;
    const contentIds = new Set(votes.map((v) => v.contentId));
    const sentiment = total ? Math.round((up / total) * 100) : 0;
    return { total, up, down, videos: contentIds.size, sentiment };
  }, [votes]);

  async function loadSnippet(vote: Vote, contentId: string) {
    setSnippets((prev) => ({
      ...prev,
      [vote.id]: { loading: true },
    }));
    try {
      const res = await fetch(
        `/api/content/${encodeURIComponent(contentId)}/snippet?center=${vote.timeSeconds}&window=8`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Transcript unavailable");
      }
      setSnippets((prev) => ({
        ...prev,
        [vote.id]: {
          loading: false,
          segments: json?.segments || [],
          range: json?.range,
        },
      }));
    } catch (e: any) {
      setSnippets((prev) => ({
        ...prev,
        [vote.id]: {
          loading: false,
          error: e?.message || "Transcript unavailable",
        },
      }));
    }
  }

  return (
    <div className="app-shell px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">Reactor Dashboard</div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Your Video Reactions
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
            disabled={refreshCooldown}
          >
            {refreshCooldown ? "Please wait…" : "Refresh"}
          </button>
          <div className="chip">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-[softPulse_2.4s_infinite]"></span>
            Extension Connected
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 glass-panel px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_380px] gap-6">
        <aside className="space-y-6">
          <div className="glass-panel p-5 fade-in">
            <div className="section-title">Statistics</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="stat-card">
                <div className="stat-value">{stats.videos}</div>
                <div className="stat-label">Videos</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Reactions</div>
              </div>
              <div className="stat-card">
                <div className="stat-value text-[var(--accent)]">
                  {stats.up}
                </div>
                <div className="stat-label">Likes</div>
              </div>
              <div className="stat-card">
                <div className="stat-value text-[var(--danger)]">
                  {stats.down}
                </div>
                <div className="stat-label">Dislikes</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Sentiment</span>
                <span>{stats.sentiment}% positive</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)]"
                  style={{ width: `${stats.sentiment}%` }}
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="section-title">By Platform</div>
              <div className="mt-3 space-y-2 text-sm">
                {platformCounts.length === 0 && (
                  <div className="text-[var(--muted)]">No data yet</div>
                )}
                {platformCounts.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span>{name}</span>
                    <span className="text-[var(--muted)]">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="section-title">Last 7 Days</div>
              <div className="mt-3 grid grid-cols-7 gap-2">
                {dailyBuckets.map((b) => (
                  <div key={b.date.toISOString()} className="text-center">
                    <div
                      className="mx-auto w-full rounded-full bg-white/10 flex items-end overflow-hidden"
                      style={{ height: "42px" }}
                    >
                      <div
                        className="rounded-full bg-[var(--accent-2)]"
                        style={{
                          height: `${Math.min(100, b.count * 12)}%`,
                          marginTop: "auto",
                        }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--muted)]">
                      {b.date.toLocaleDateString(undefined, {
                        weekday: "short",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel p-5 fade-in">
            <div className="section-title">Filters</div>
            <div className="mt-4 space-y-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search content or URL"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-2)]"
              />
              <div className="flex gap-2">
                <select
                  value={voteType}
                  onChange={(e) => setVoteType(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">All reactions</option>
                  <option value="UP">Likes only</option>
                  <option value="DOWN">Dislikes only</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`chip ${platform === p ? "active" : ""}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={loadVotes}
                className="mt-2 w-full rounded-xl bg-[var(--accent-2)]/20 border border-[var(--accent-2)]/40 px-4 py-2 text-sm font-medium hover:bg-[var(--accent-2)]/30 transition"
              >
                Apply filters
              </button>
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="glass-panel p-5 fade-in">
            <div className="flex items-center justify-between">
              <div>
                <div className="section-title">Watched Videos</div>
                <div className="text-lg font-semibold">
                  {contentRows.length} total
                </div>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {loading ? "Loading…" : "Updated just now"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {loading && (
                <div className="text-[var(--muted)]">Loading activity…</div>
              )}
              {!loading && contentRows.length === 0 && (
                <div className="text-[var(--muted)]">
                  No reactions yet. Vote on a video to see it here.
                </div>
              )}
              {contentRows
                .slice(
                  (videoPage - 1) * videosPerPage,
                  videoPage * videosPerPage,
                )
                .map((row) => {
                  const isActive = row.contentId === (pendingId || selectedId);
                  const meta = getMeta(row.contentId);
                  const title = meta?.title || row.contentId;
                  const host =
                    meta?.pageHost ||
                    row.pageHost ||
                    getHostFromUrl(meta?.pageUrl || row.pageUrl) ||
                    "Unknown";
                  const thumb = getThumbnailUrl(row.contentId);
                  const openUrl = getOpenUrl(
                    row.contentId,
                    meta?.pageUrl || row.pageUrl,
                  );
                  return (
                    <button
                      key={row.contentId}
                      onClick={() => setPendingId(row.contentId)}
                      className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                        isActive
                          ? "border-[var(--accent-2)]/60 bg-[var(--accent-2)]/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-16 rounded-lg bg-white/10 overflow-hidden flex items-center justify-center text-xs text-[var(--muted)]">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span>{row.platform}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium truncate">
                              {title}
                            </div>
                            <span
                              onClick={(event) => {
                                event.stopPropagation();
                                if (openUrl !== "#")
                                  window.open(openUrl, "_blank");
                              }}
                              className="text-xs text-[var(--muted)] hover:text-white"
                            >
                              ↗
                            </span>
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate">
                            {host}
                          </div>
                          {meta?.channelName && (
                            <div className="text-xs text-[var(--muted)] truncate">
                              {meta.channelName}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="chip">{row.platform}</span>
                            <span className="chip badge-up">▲ {row.up}</span>
                            <span className="chip badge-down">
                              ▼ {row.down}
                            </span>
                            <span className="chip">
                              {fmtShortDate(row.lastVotedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

              {contentRows.length > videosPerPage && (
                <div className="flex items-center justify-between text-xs text-[var(--muted)] pt-2">
                  <span>
                    Showing{" "}
                    {Math.min(
                      (videoPage - 1) * videosPerPage + 1,
                      contentRows.length,
                    )}{" "}
                    - {Math.min(videoPage * videosPerPage, contentRows.length)}{" "}
                    of {contentRows.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/5">
                      Page {videoPage} /{" "}
                      {Math.max(
                        1,
                        Math.ceil(contentRows.length / videosPerPage),
                      )}
                    </span>
                    <button
                      onClick={() => setVideoPage((p) => Math.max(1, p - 1))}
                      disabled={videoPage === 1}
                      className="px-2 py-1 rounded-lg border border-white/10 disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => {
                        const totalPages = Math.max(
                          1,
                          Math.ceil(contentRows.length / videosPerPage),
                        );
                        setVideoPage((p) => Math.min(totalPages, p + 1));
                      }}
                      disabled={
                        videoPage >=
                        Math.ceil(contentRows.length / videosPerPage)
                      }
                      className="px-2 py-1 rounded-lg border border-white/10 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel-strong p-5 fade-in">
            <div className="flex items-center justify-between">
              <div>
                <div className="section-title">Video Details</div>
                <div className="text-lg font-semibold">
                  {selected ? selected.platform : "No selection"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isRefreshing && (
                  <span className="chip active text-xs">Refreshing</span>
                )}
                <button
                  className="text-xs text-[var(--muted)] border border-white/10 rounded-full w-7 h-7 flex items-center justify-center hover:text-white"
                  onClick={() => setSelectedId(null)}
                >
                  {selected ? "X" : ""}
                </button>
              </div>
            </div>

            {!selected && (
              <div className="mt-6 text-[var(--muted)] text-sm">
                Select a video to see the reaction timeline.
              </div>
            )}

            {selected && (
              <div className="mt-4 space-y-4">
                {isDetailLoading ? (
                  <div className="space-y-3">
                    <div className="skeleton h-4 w-3/4" />
                    <div className="skeleton h-6 w-1/2" />
                    <div className="skeleton h-4 w-32" />
                    <div className="skeleton h-3 w-full" />
                    <div className="skeleton h-3 w-5/6" />
                    <div className="skeleton h-24 w-full" />
                    <div className="skeleton h-12 w-full" />
                    <div className="skeleton h-12 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-[var(--muted)] break-words">
                      {selectedMeta?.pageUrl ||
                        selected.pageUrl ||
                        selected.contentId}{" "}
                      • {fmtShortDate(selected.lastVotedAt)}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="chip badge-up">▲ {selected.up}</span>
                      <span className="chip badge-down">▼ {selected.down}</span>
                      <span className="chip">
                        Duration: {fmtTime(durationSeconds || 0)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                      <a
                        href={getOpenUrl(
                          selected.contentId,
                          selectedMeta?.pageUrl || selected.pageUrl,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent-2)] hover:underline"
                      >
                        Open Original Video
                      </a>
                      <button
                        onClick={async () => {
                          const url = `${window.location.origin}/m/${encodeURIComponent(
                            selected.contentId,
                          )}`;
                          await navigator.clipboard.writeText(url);
                          setShareCopied(true);
                          window.setTimeout(() => setShareCopied(false), 1200);
                        }}
                        className="text-[var(--muted)] hover:text-white"
                      >
                        {shareCopied ? "Copied!" : "Copy Share Link"}
                      </button>
                    </div>

                    <div>
                      <div className="section-title">Reaction Timeline</div>
                      <div className="mt-3 timeline-track">
                        {selected.votes.map((v) => {
                          const maxTime = Math.max(durationSeconds || 0, 10);
                          const left = Math.min(
                            100,
                            Math.max(0, (v.timeSeconds / maxTime) * 100),
                          );
                          return (
                            <span
                              key={v.id}
                              className={`timeline-marker ${
                                v.voteType === "UP" ? "up" : "down"
                              }`}
                              style={{ left: `${left}%` }}
                              title={`${fmtTime(v.timeSeconds)} ${v.voteType}`}
                            >
                              {v.voteType === "UP" ? "▲" : "▼"}
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
                        <span>0:00</span>
                        <span>{fmtTime(durationSeconds || 0)}</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <div className="section-title">
                          All Reactions ({selected.votes.length})
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          Click to play snippet
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {selected.votes
                          .slice()
                          .sort((a, b) => a.timeSeconds - b.timeSeconds)
                          .slice(
                            (reactionPage - 1) * reactionsPerPage,
                            reactionPage * reactionsPerPage,
                          )
                          .map((v) => {
                            const snippet = snippets[v.id];
                            const isOpen = openVoteId === v.id;
                            return (
                              <div key={v.id}>
                                <button
                                  onClick={() => {
                                    const nextOpen = isOpen ? null : v.id;
                                    setOpenVoteId(nextOpen);
                                    if (!isOpen && !snippet) {
                                      loadSnippet(v, selected.contentId);
                                    }
                                  }}
                                  className={`reaction-row w-full text-left ${
                                    v.voteType === "UP" ? "up" : "down"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="text-lg">
                                      {v.voteType === "UP" ? "▲" : "▼"}
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium">
                                        {fmtTime(v.timeSeconds)}
                                      </div>
                                      <div className="text-xs text-[var(--muted)]">
                                        {fmtShortDate(v.createdAt)} •{" "}
                                        {fmtClock(v.createdAt)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-xs text-[var(--muted)]">
                                    ▶
                                  </div>
                                </button>

                                {isOpen && (
                                  <div className="snippet-panel">
                                    {snippet?.loading && (
                                      <div className="text-[var(--muted)]">
                                        Loading transcript…
                                      </div>
                                    )}
                                    {!snippet?.loading && snippet?.error && (
                                      <div className="text-[var(--muted)]">
                                        {snippet.error}
                                      </div>
                                    )}
                                    {!snippet?.loading &&
                                      !snippet?.error &&
                                      (!snippet?.segments ||
                                        snippet.segments.length === 0) && (
                                        <div className="text-[var(--muted)]">
                                          No transcript text found for this
                                          moment.
                                        </div>
                                      )}
                                    {!snippet?.loading &&
                                      !snippet?.error &&
                                      snippet?.segments &&
                                      snippet.segments.length > 0 && (
                                        <div className="space-y-2">
                                          {snippet.range && (
                                            <div className="text-[var(--muted)] text-xs">
                                              {fmtTime(snippet.range.start)} –{" "}
                                              {fmtTime(snippet.range.end)}
                                            </div>
                                          )}
                                          <div className="space-y-1">
                                            {snippet.segments.map((s, idx) => (
                                              <div
                                                key={`${v.id}-${idx}`}
                                                className="flex gap-2"
                                              >
                                                <div className="text-[var(--muted)] font-mono w-12">
                                                  {fmtTime(s.start)}
                                                </div>
                                                <div>{s.text}</div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        {selected.votes.length > reactionsPerPage && (
                          <div className="flex items-center justify-between text-xs text-[var(--muted)] pt-2">
                            <span>
                              Showing{" "}
                              {Math.min(
                                (reactionPage - 1) * reactionsPerPage + 1,
                                selected.votes.length,
                              )}{" "}
                              -{" "}
                              {Math.min(
                                reactionPage * reactionsPerPage,
                                selected.votes.length,
                              )}{" "}
                              of {selected.votes.length}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setReactionPage((p) => Math.max(1, p - 1))
                                }
                                disabled={reactionPage === 1}
                                className="px-2 py-1 rounded-lg border border-white/10 disabled:opacity-40"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() => {
                                  const totalPages = Math.max(
                                    1,
                                    Math.ceil(
                                      selected.votes.length / reactionsPerPage,
                                    ),
                                  );
                                  setReactionPage((p) =>
                                    Math.min(totalPages, p + 1),
                                  );
                                }}
                                disabled={
                                  reactionPage >=
                                  Math.ceil(
                                    selected.votes.length / reactionsPerPage,
                                  )
                                }
                                className="px-2 py-1 rounded-lg border border-white/10 disabled:opacity-40"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
