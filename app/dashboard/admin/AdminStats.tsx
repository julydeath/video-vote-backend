"use client";

import { useEffect, useState } from "react";

type Stats = {
  totals: {
    votes: number;
    upvotes: number;
    downvotes: number;
  };
  topContent: { contentId: string; count: number }[];
  topUsers: { user: { email?: string }; count: number }[];
};

export default function AdminStats({ token }: { token: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => setStats(j));
  }, []);

  if (!stats) return <div>Loading stats…</div>;

  return (
    <div className="grid grid-cols-3 gap-6">
      <StatCard label="Total Votes" value={stats.totals.votes} />
      <StatCard label="Upvotes" value={stats.totals.upvotes} />
      <StatCard label="Downvotes" value={stats.totals.downvotes} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded p-6">
      <div className="text-gray-500 text-sm">{label}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}
