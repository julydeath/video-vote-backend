"use client";

import { useEffect, useState } from "react";

type Vote = {
  id: string;
  contentId: string;
  timeSeconds: number;
  voteType: "UP" | "DOWN";
  pageUrl?: string | null;
  createdAt: string;
  user: {
    email?: string | null;
    name?: string | null;
  };
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AdminVotesTable({ token }: { token: string }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(false);

  const [voteType, setVoteType] = useState("");
  const [q, setQ] = useState("");

  async function loadVotes() {
    setLoading(true);

    const params = new URLSearchParams();
    if (voteType) params.set("voteType", voteType);
    if (q) params.set("q", q);

    const res = await fetch(`/api/admin/votes?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    setVotes(json.votes || []);
    setLoading(false);
  }

  useEffect(() => {
    loadVotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="glass-panel p-5 h-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="section-title">Live Activity</div>
          <div className="text-lg font-semibold">Latest votes</div>
        </div>
        <button
          onClick={loadVotes}
          className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
          value={voteType}
          onChange={(e) => setVoteType(e.target.value)}
        >
          <option value="">All</option>
          <option value="UP">Upvotes</option>
          <option value="DOWN">Downvotes</option>
        </select>

        <input
          className="flex-1 min-w-[160px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
          placeholder="Search by user, URL, content ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          onClick={loadVotes}
          className="px-3 py-2 rounded-xl border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/20 text-xs"
        >
          Apply
        </button>
      </div>

      <div className="mt-4 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-[var(--muted)]">
            <tr>
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium">Content</th>
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-left px-3 py-2 font-medium">Vote</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && votes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center">
                  No data
                </td>
              </tr>
            )}

            {votes.map((v) => (
              <tr key={v.id} className="border-t border-white/10">
                <td className="px-3 py-2">
                  {v.user.email || v.user.name || "Unknown"}
                </td>
                <td className="px-3 py-2 truncate max-w-[160px]">
                  {v.pageUrl ? (
                    <a
                      href={v.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent-2)] hover:underline"
                    >
                      {v.contentId}
                    </a>
                  ) : (
                    v.contentId
                  )}
                </td>
                <td className="px-3 py-2">{fmtTime(v.timeSeconds)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`chip ${
                      v.voteType === "UP" ? "badge-up" : "badge-down"
                    }`}
                  >
                    {v.voteType === "UP" ? "▲ Up" : "▼ Down"}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {new Date(v.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
