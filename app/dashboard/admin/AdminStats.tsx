"use client";

import { useEffect, useState } from "react";

type Stats = {
  totals: {
    votes: number;
    upvotes: number;
    downvotes: number;
  };
  topContent: { contentId: string; count: number }[];
  topUsers: { user: { email?: string; name?: string } | null; count: number }[];
};

export default function AdminStats({ token }: { token: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => setStats(j));
  }, [token]);

  if (!stats) return <div className="glass-panel p-6">Loading stats…</div>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
      <div className="glass-panel p-6">
        <div className="section-title">Totals</div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="stat-value">{stats.totals.votes}</div>
            <div className="stat-label">Total Votes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-[var(--accent)]">
              {stats.totals.upvotes}
            </div>
            <div className="stat-label">Upvotes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-[var(--danger)]">
              {stats.totals.downvotes}
            </div>
            <div className="stat-label">Downvotes</div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <div className="section-title">Top Signals</div>
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <div className="text-xs text-[var(--muted)]">Top Content</div>
            <div className="mt-2 space-y-2">
              {stats.topContent.length === 0 && (
                <div className="text-[var(--muted)]">No content yet</div>
              )}
              {stats.topContent.slice(0, 5).map((c) => (
                <div
                  key={c.contentId}
                  className="flex items-center justify-between"
                >
                  <span className="truncate max-w-[220px]">
                    {c.contentId}
                  </span>
                  <span className="text-[var(--muted)]">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">Top Users</div>
            <div className="mt-2 space-y-2">
              {stats.topUsers.length === 0 && (
                <div className="text-[var(--muted)]">No users yet</div>
              )}
              {stats.topUsers.slice(0, 5).map((u, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="truncate max-w-[220px]">
                    {u.user?.email || u.user?.name || "Unknown"}
                  </span>
                  <span className="text-[var(--muted)]">{u.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
