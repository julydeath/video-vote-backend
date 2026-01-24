"use client";

import { useEffect, useMemo, useState } from "react";

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

  // filters
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(""); // yyyy-mm-dd
  const [to, setTo] = useState("");

  // expand
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
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">Content Votes</h2>
          <p className="text-sm text-neutral-400">
            Aggregated by contentId (YouTube + other sites)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadContent}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select
          className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
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
          className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contentId or URL…"
        />

        <input
          type="date"
          className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />

        <input
          type="date"
          className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={loadContent}
          className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm border border-neutral-700 transition"
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
              // don’t auto-fetch; user can hit apply, or uncomment below:
              // loadContent();
            }}
            className="text-neutral-300 hover:text-white text-sm px-3 py-2 rounded-lg border border-neutral-800 hover:border-neutral-700 transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mt-6 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-800 text-neutral-300 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Content</th>
                <th className="text-left px-4 py-3 font-medium">Up</th>
                <th className="text-left px-4 py-3 font-medium">Down</th>
                <th className="text-left px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Last</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="bg-neutral-900 text-neutral-200">
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    No results
                    {hasFilters ? " for these filters." : "."}
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((it) => {
                  const isOpen = openId === it.contentId;

                  return (
                    // ✅ Fragment instead of div to keep <tbody> valid
                    <tbody key={it.contentId} className="border-0">
                      <tr
                        className={[
                          "border-t border-neutral-800 transition",
                          isOpen
                            ? "bg-neutral-800/40"
                            : "hover:bg-neutral-800/50",
                        ].join(" ")}
                      >
                        <td className="px-4 py-3 max-w-xl">
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => openDetails(it.contentId)}
                              className="mt-0.5 shrink-0 w-7 h-7 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 transition flex items-center justify-center text-neutral-200"
                              aria-label={isOpen ? "Collapse" : "Expand"}
                              title={isOpen ? "Hide voters" : "View voters"}
                            >
                              {isOpen ? "–" : "+"}
                            </button>

                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {it.pageUrl ? (
                                  <a
                                    className="text-blue-400 hover:underline"
                                    href={it.pageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={it.pageUrl}
                                  >
                                    {it.contentId}
                                  </a>
                                ) : (
                                  <span title={it.contentId}>
                                    {it.contentId}
                                  </span>
                                )}
                              </div>
                              {it.pageUrl && (
                                <div className="text-xs text-neutral-500 truncate mt-1">
                                  {it.pageUrl}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-green-400 font-medium tabular-nums">
                          ▲ {it.up}
                        </td>
                        <td className="px-4 py-3 text-red-400 font-medium tabular-nums">
                          ▼ {it.down}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{it.total}</td>
                        <td className="px-4 py-3 text-neutral-400">
                          {fmtDate(it.lastVotedAt)}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openDetails(it.contentId)}
                            className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-3 py-1.5 rounded-lg text-xs transition"
                          >
                            {isOpen ? "Hide" : "View voters"}
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-t border-neutral-800">
                          <td
                            colSpan={6}
                            className="px-4 py-4 bg-neutral-950/40"
                          >
                            {votesLoading && (
                              <div className="text-neutral-400 text-sm">
                                Loading votes…
                              </div>
                            )}

                            {!votesLoading &&
                              (!votes || votes.length === 0) && (
                                <div className="text-neutral-400 text-sm">
                                  No votes found.
                                </div>
                              )}

                            {!votesLoading && votes && votes.length > 0 && (
                              <div className="border border-neutral-800 rounded-xl overflow-hidden">
                                <div className="max-h-72 overflow-auto">
                                  <table className="w-full text-xs">
                                    <thead className="bg-neutral-900 text-neutral-400 sticky top-0">
                                      <tr>
                                        <th className="text-left px-3 py-2">
                                          User
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Vote
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Time
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Bucket
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Date
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-neutral-950 text-neutral-200">
                                      {votes.map((v) => (
                                        <tr
                                          key={v.id}
                                          className="border-t border-neutral-900"
                                        >
                                          <td className="px-3 py-2">
                                            <div className="font-medium">
                                              {v.user.email ||
                                                v.user.name ||
                                                v.user.id}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2">
                                            {v.voteType === "UP" ? (
                                              <span className="text-green-400 font-semibold">
                                                ▲ UP
                                              </span>
                                            ) : (
                                              <span className="text-red-400 font-semibold">
                                                ▼ DOWN
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 tabular-nums">
                                            {fmtTime(v.timeSeconds)}
                                          </td>
                                          <td className="px-3 py-2 tabular-nums">
                                            {v.timeBucket}s
                                          </td>
                                          <td className="px-3 py-2 text-neutral-400">
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
                    </tbody>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
