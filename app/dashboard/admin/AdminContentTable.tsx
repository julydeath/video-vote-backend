"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type UserItem = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string;
};

type ContentRow = {
  contentId: string;
  up: number;
  down: number;
  total: number;
  pageUrl?: string | null;
  lastVotedAt?: string | null;
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

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export default function AdminContentTable({ token }: { token: string }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [items, setItems] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [votes, setVotes] = useState<VoteRow[] | null>(null);
  const [votesLoading, setVotesLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => setUsers(j.users || []))
      .catch(() => setUsers([]));
  }, [token]);

  async function loadContent() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59").toISOString());

      const res = await fetch(`/api/admin/content?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => null);
      setItems(json?.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetails(contentId: string) {
    if (openId === contentId) {
      setOpenId(null);
      setVotes(null);
      return;
    }

    setOpenId(contentId);
    setVotes(null);
    setVotesLoading(true);

    try {
      const res = await fetch(
        `/api/admin/content/${encodeURIComponent(contentId)}/votes?limit=200`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json().catch(() => null);
      setVotes(json?.votes || []);
    } finally {
      setVotesLoading(false);
    }
  }

  const userOptions = useMemo(() => {
    return users.map((u) => ({
      id: u.id,
      label: u.email || u.name || u.id,
    }));
  }, [users]);

  const hasFilters = Boolean(userId || q.trim() || from || to);

  return (
    <div className="glass-panel p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="section-title">Content Signals</div>
          <div className="text-lg font-semibold">Votes by content</div>
          <p className="text-xs text-[var(--muted)] mt-1">
            Aggregated across YouTube and other platforms.
          </p>
        </div>

        <button
          onClick={loadContent}
          className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
        <select
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
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
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contentId or URL"
        />

        <input
          type="date"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />

        <input
          type="date"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={loadContent}
          className="px-4 py-2 rounded-xl border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/20 text-xs"
        >
          Apply filters
        </button>
        {hasFilters && (
          <button
            onClick={() => {
              setUserId("");
              setQ("");
              setFrom("");
              setTo("");
            }}
            className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-[var(--muted)] sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Content</th>
                <th className="text-left px-3 py-2">Up</th>
                <th className="text-left px-3 py-2">Down</th>
                <th className="text-left px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Last</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center">
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center">
                    No results
                  </td>
                </tr>
              )}

              {items.map((it) => {
                const isOpen = openId === it.contentId;
                return (
                  <Fragment key={it.contentId}>
                    <tr
                      className={`border-t border-white/10 ${
                        isOpen ? "bg-white/5" : "hover:bg-white/5"
                      }`}
                    >
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openDetails(it.contentId)}
                            className="w-6 h-6 rounded-md border border-white/10 bg-white/5 text-xs"
                          >
                            {isOpen ? "–" : "+"}
                          </button>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {it.pageUrl ? (
                                <a
                                  className="text-[var(--accent-2)] hover:underline"
                                  href={it.pageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={it.pageUrl || it.contentId}
                                >
                                  {it.contentId}
                                </a>
                              ) : (
                                it.contentId
                              )}
                            </div>
                            {it.pageUrl && (
                              <div className="text-[10px] text-[var(--muted)] truncate">
                                {it.pageUrl}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[var(--accent)]">
                        ▲ {it.up}
                      </td>
                      <td className="px-3 py-2 text-[var(--danger)]">
                        ▼ {it.down}
                      </td>
                      <td className="px-3 py-2">{it.total}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">
                        {fmtDate(it.lastVotedAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => openDetails(it.contentId)}
                          className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-xs"
                        >
                          {isOpen ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-t border-white/10">
                        <td colSpan={6} className="px-4 py-4">
                          {votesLoading && (
                            <div className="text-[var(--muted)] text-xs">
                              Loading votes…
                            </div>
                          )}

                          {!votesLoading && (!votes || votes.length === 0) && (
                            <div className="text-[var(--muted)] text-xs">
                              No votes found.
                            </div>
                          )}

                          {!votesLoading && votes && votes.length > 0 && (
                            <div className="border border-white/10 rounded-xl overflow-hidden">
                              <div className="max-h-72 overflow-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-white/5 text-[var(--muted)] sticky top-0">
                                    <tr>
                                      <th className="text-left px-3 py-2">User</th>
                                      <th className="text-left px-3 py-2">Vote</th>
                                      <th className="text-left px-3 py-2">Time</th>
                                      <th className="text-left px-3 py-2">Bucket</th>
                                      <th className="text-left px-3 py-2">Date</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {votes.map((v) => (
                                      <tr key={v.id} className="border-t border-white/10">
                                        <td className="px-3 py-2">
                                          {v.user.email || v.user.name || v.user.id}
                                        </td>
                                        <td className="px-3 py-2">
                                          <span
                                            className={`chip ${
                                              v.voteType === "UP"
                                                ? "badge-up"
                                                : "badge-down"
                                            }`}
                                          >
                                            {v.voteType}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2">
                                          {fmtTime(v.timeSeconds)}
                                        </td>
                                        <td className="px-3 py-2">
                                          {v.timeBucket}s
                                        </td>
                                        <td className="px-3 py-2 text-[var(--muted)]">
                                          {fmtDate(v.createdAt)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
