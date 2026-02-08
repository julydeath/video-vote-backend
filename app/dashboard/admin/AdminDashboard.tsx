//@ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type UserItem = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type ContentRow = {
  contentId: string;
  up: number;
  down: number;
  total: number;
  pageUrl?: string | null;
  lastVotedAt?: string | null;
};

type ContentMeta = {
  contentId: string;
  title?: string | null;
  channelName?: string | null;
  pageUrl?: string | null;
  pageHost?: string | null;
  durationSeconds?: number | null;
};

type VoteRow = {
  id: string;
  voteType: "UP" | "DOWN";
  timeSeconds: number;
  timeBucket: number;
  pageUrl?: string | null;
  createdAt: string;
  user: { id: string; email?: string | null; name?: string | null };
};

type AdminStats = {
  totals: { votes: number; upvotes: number; downvotes: number };
  topContent: { contentId: string; count: number }[];
  topUsers: { user: { email?: string; name?: string } | null; count: number }[];
};

type Summary = {
  totals: { up: number; down: number; total: number };
  durationSeconds: number;
  timeline: { timeBucket: number; up: number; down: number }[];
};

type TranscriptSegment = { start: number; dur: number; text: string };


function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtShortDate(value?: string | null) {
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

function fmtClock(value?: string | null) {
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

function getOpenUrl(contentId: string, pageUrl?: string | null) {
  if (pageUrl) return pageUrl;
  if (contentId.startsWith("yt:")) {
    const vid = contentId.slice(3);
    return `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`;
  }
  return "#";
}

export default function AdminDashboard({ token }: { token: string }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [items, setItems] = useState<ContentRow[]>([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [contentMeta, setContentMeta] = useState<Record<string, ContentMeta>>(
    {},
  );

  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 5;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [votesPage, setVotesPage] = useState(1);
  const votesPerPage = 5;

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
  const selectDebounceRef = useRef<number | null>(null);
  const selectionDelayMs = 2000;
  const [shareCopied, setShareCopied] = useState(false);
  const summaryBypassRef = useRef(false);
  const votesBypassRef = useRef(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [metaRefreshTick, setMetaRefreshTick] = useState(0);

  useEffect(() => {
    fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => setUsers(j.users || []))
      .catch(() => setUsers([]));
  }, [token]);

  useEffect(() => {
    fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => setStats(j));
  }, [token]);

  async function loadContent(nextPage = page, bypass = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59").toISOString());
      params.set("limit", String(perPage));
      params.set("page", String(nextPage));
      if (bypass) params.set("fresh", "1");

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (bypass) headers["x-cache-bypass"] = "1";

      const res = await fetch(`/api/admin/content?${params.toString()}`, {
        headers,
      });
      const json = await res.json().catch(() => null);
      setItems(json?.items || []);
      setItemsTotal(Number(json?.total || 0));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (refreshCooldown) return;
    setRefreshCooldown(true);
    window.setTimeout(() => setRefreshCooldown(false), 5000);
    await loadContent(page, true);
    setMetaRefreshTick((t) => t + 1);
    if (selectedId) {
      summaryBypassRef.current = true;
      votesBypassRef.current = true;
      summaryQuery.refetch();
      votesQuery.refetch();
    }
  }

  useEffect(() => {
    loadContent(1);
    setPage(1);
  }, [userId, q, from, to]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      setPendingId(null);
      return;
    }
    if (!selectedId || !items.find((i) => i.contentId === selectedId)) {
      setSelectedId(items[0].contentId);
    }
  }, [items, selectedId]);

  useEffect(() => {
    if (items.length === 0) return;
    const contentIds = items.map((i) => i.contentId);
    const force = metaRefreshTick > 0;
    fetch(`/api/content/lookup${force ? "?force=1" : ""}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(force ? { "x-meta-refresh": "1" } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contentIds }),
    })
      .then((r) => r.json())
      .then((j) => {
        const list = (j?.items || []) as ContentMeta[];
        if (!list.length) return;
        setContentMeta((prev) => {
          const next = { ...prev };
          for (const item of list) {
            next[item.contentId] = item;
          }
          return next;
        });
      })
      .catch(() => null);
  }, [items, token, metaRefreshTick]);

  useEffect(() => {
    setVotesPage(1);
    setOpenVoteId(null);
    setShareCopied(false);
  }, [selectedId]);

  useEffect(() => {
    setOpenVoteId(null);
  }, [votesPage]);

  const summaryQuery = useQuery({
    queryKey: ["adminSummary", selectedId, token],
    enabled: Boolean(selectedId),
    staleTime: 30_000,
    queryFn: async () => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (summaryBypassRef.current) {
        headers["x-cache-bypass"] = "1";
        summaryBypassRef.current = false;
      }
      const res = await fetch(
        `/api/admin/content/${encodeURIComponent(selectedId!)}/summary`,
        { headers },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load summary");
      return json as Summary;
    },
  });

  const votesQuery = useQuery({
    queryKey: ["adminVotes", selectedId, votesPage, votesPerPage, token],
    enabled: Boolean(selectedId),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (votesBypassRef.current) {
        headers["x-cache-bypass"] = "1";
        votesBypassRef.current = false;
      }
      const res = await fetch(
        `/api/admin/content/${encodeURIComponent(selectedId!)}/votes?limit=${votesPerPage}&page=${votesPage}`,
        { headers },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load votes");
      return json as {
        votes: VoteRow[];
        total: number;
        page: number;
        limit: number;
      };
    },
  });

  async function loadSnippet(vote: VoteRow) {
    setSnippets((prev) => ({
      ...prev,
      [vote.id]: { loading: true },
    }));
    try {
      const res = await fetch(
        `/api/content/${encodeURIComponent(
          vote.contentId,
        )}/snippet?center=${vote.timeSeconds}&window=8`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Transcript unavailable");
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
        [vote.id]: { loading: false, error: e?.message || "Unavailable" },
      }));
    }
  }

  const activeId = pendingId || selectedId;
  const selectedMeta = activeId ? contentMeta[activeId] : null;
  const selectedSummary = summaryQuery.data;
  const durationSeconds = selectedSummary?.durationSeconds || 0;
  const votes = votesQuery.data?.votes ?? [];
  const votesTotal = votesQuery.data?.total ?? 0;
  const isRefreshing =
    (summaryQuery.isFetching || votesQuery.isFetching) &&
    (Boolean(summaryQuery.data) || Boolean(votesQuery.data));
  const isDetailLoading =
    (pendingId && pendingId !== selectedId) ||
    (summaryQuery.isFetching && !summaryQuery.data) ||
    (votesQuery.isFetching && !votesQuery.data);

  const totalPages = Math.max(1, Math.ceil(itemsTotal / perPage));
  const votesTotalPages = Math.max(1, Math.ceil(votesTotal / votesPerPage));

  const userOptions = useMemo(() => {
    return users.map((u) => ({
      id: u.id,
      label: u.email || u.name || u.id,
    }));
  }, [users]);

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

  return (
    <div className="app-shell px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">Admin Console</div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            All Video Reactions
          </h1>
          <p className="text-[var(--muted)] mt-1">
            Track every vote, by user and by video.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
          disabled={refreshCooldown}
        >
          {refreshCooldown ? "Please wait…" : "Refresh"}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_380px] gap-6">
        <aside className="space-y-6">
          <div className="glass-panel p-5">
            <div className="section-title">Statistics</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="stat-card">
                <div className="stat-value">{stats?.totals.votes || 0}</div>
                <div className="stat-label">Total Votes</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats?.totals.upvotes || 0}</div>
                <div className="stat-label">Upvotes</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats?.totals.downvotes || 0}</div>
                <div className="stat-label">Downvotes</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{itemsTotal}</div>
                <div className="stat-label">Videos</div>
              </div>
            </div>
          </div>

          <div className="glass-panel p-5">
            <div className="section-title">Filters</div>
            <div className="mt-4 space-y-3">
              <select
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">All users</option>
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search content or URL"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
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
              <button
                onClick={() => loadContent(1)}
                className="w-full rounded-xl bg-[var(--accent-2)]/20 border border-[var(--accent-2)]/40 px-4 py-2 text-sm font-medium"
              >
                Apply filters
              </button>
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="glass-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="section-title">Videos</div>
                <div className="text-lg font-semibold">{itemsTotal} total</div>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {loading ? "Loading…" : "Updated just now"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {loading && <div className="text-[var(--muted)]">Loading…</div>}
              {!loading && items.length === 0 && (
                <div className="text-[var(--muted)]">No results</div>
              )}
              {items.map((item) => {
                const isActive = item.contentId === (pendingId || selectedId);
                const meta = contentMeta[item.contentId];
                const title = meta?.title || item.contentId;
                const thumb = getThumbnailUrl(item.contentId);
                const openUrl = getOpenUrl(
                  item.contentId,
                  meta?.pageUrl || item.pageUrl,
                );
                return (
                  <button
                    key={item.contentId}
                    onClick={() => setPendingId(item.contentId)}
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
                          <span>Video</span>
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
                          {meta?.pageHost ||
                            meta?.pageUrl ||
                            item.pageUrl ||
                            "—"}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="chip badge-up">▲ {item.up}</span>
                          <span className="chip badge-down">▼ {item.down}</span>
                          <span className="chip">
                            {fmtShortDate(item.lastVotedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {itemsTotal > perPage && (
                <div className="flex items-center justify-between text-xs text-[var(--muted)] pt-2">
                  <span>
                    Showing {(page - 1) * perPage + 1} -{" "}
                    {Math.min(page * perPage, itemsTotal)} of {itemsTotal}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/5">
                      Page {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => {
                        const next = Math.max(1, page - 1);
                        setPage(next);
                        loadContent(next);
                      }}
                      disabled={page === 1}
                      className="px-2 py-1 rounded-lg border border-white/10 disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => {
                        const next = Math.min(totalPages, page + 1);
                        setPage(next);
                        loadContent(next);
                      }}
                      disabled={page >= totalPages}
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
          <div className="panel-strong p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="section-title">Video Details</div>
                <div className="text-lg font-semibold">
                  {selectedMeta?.title || activeId || "No selection"}
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
                  {selectedId ? "X" : ""}
                </button>
              </div>
            </div>

            {!activeId && (
              <div className="mt-6 text-[var(--muted)] text-sm">
                Select a video to see details.
              </div>
            )}

            {activeId && (
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
                      {selectedMeta?.pageUrl || activeId} •{" "}
                      {fmtShortDate(
                        items.find((i) => i.contentId === activeId)
                          ?.lastVotedAt,
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="chip badge-up">
                        ▲ {selectedSummary?.totals?.up || 0}
                      </span>
                      <span className="chip badge-down">
                        ▼ {selectedSummary?.totals?.down || 0}
                      </span>
                      <span className="chip">
                        Duration: {fmtTime(durationSeconds)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                      <a
                        href={getOpenUrl(activeId, selectedMeta?.pageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent-2)] hover:underline"
                      >
                        Open Original Video
                      </a>
                      <button
                        onClick={async () => {
                          const url = `${window.location.origin}/m/${encodeURIComponent(
                            activeId,
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
                        {(selectedSummary?.timeline || []).map((t) => {
                          const maxTime = Math.max(durationSeconds, 10);
                          const left = Math.min(
                            100,
                            Math.max(0, (t.timeBucket / maxTime) * 100),
                          );
                          const voteType = t.up >= t.down ? "UP" : "DOWN";
                          return (
                            <span
                              key={`${t.timeBucket}-${voteType}`}
                              className={`timeline-marker ${
                                voteType === "UP" ? "up" : "down"
                              }`}
                              style={{ left: `${left}%` }}
                              title={`${fmtTime(t.timeBucket)} UP:${t.up} DOWN:${t.down}`}
                            >
                              {voteType === "UP" ? "▲" : "▼"}
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
                        <span>0:00</span>
                        <span>{fmtTime(durationSeconds)}</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <div className="section-title">
                          All Reactions ({votesTotal})
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          Click to view snippet
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {votes.map((v) => {
                          const snippet = snippets[v.id];
                          const isOpen = openVoteId === v.id;
                          return (
                            <div key={v.id}>
                              <button
                                onClick={() => {
                                  const next = isOpen ? null : v.id;
                                  setOpenVoteId(next);
                                  if (!isOpen && !snippet) {
                                    loadSnippet(v);
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
                                      {v.user.email || v.user.name || v.user.id}
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

                        {votesTotal > votesPerPage && (
                          <div className="flex items-center justify-between text-xs text-[var(--muted)] pt-2">
                            <span>
                              Showing {(votesPage - 1) * votesPerPage + 1} -{" "}
                              {Math.min(votesPage * votesPerPage, votesTotal)}{" "}
                              of {votesTotal}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/5">
                                Page {votesPage} / {votesTotalPages}
                              </span>
                              <button
                                onClick={() =>
                                  setVotesPage((p) => Math.max(1, p - 1))
                                }
                                disabled={votesPage === 1}
                                className="px-2 py-1 rounded-lg border border-white/10 disabled:opacity-40"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() =>
                                  setVotesPage((p) =>
                                    Math.min(votesTotalPages, p + 1),
                                  )
                                }
                                disabled={votesPage >= votesTotalPages}
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
