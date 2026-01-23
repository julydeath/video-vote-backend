"use client";

import { useEffect, useState } from "react";

type Vote = {
  id: string;
  contentId: string;
  timeSeconds: number;
  voteType: "UP" | "DOWN";
  pageUrl?: string;
  createdAt: string;
  user: {
    email?: string;
    name?: string;
  };
};

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
  }, []);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">All Activity</h2>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select
          className="border px-3 py-2 rounded"
          value={voteType}
          onChange={(e) => setVoteType(e.target.value)}
        >
          <option value="">All</option>
          <option value="UP">Upvotes</option>
          <option value="DOWN">Downvotes</option>
        </select>

        <input
          className="border px-3 py-2 rounded w-80"
          placeholder="Search by user, URL, content ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          onClick={loadVotes}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Apply
        </button>
      </div>

      {/* Table */}
      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-2">User</th>
              <th className="text-left p-2">Content</th>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Vote</th>
              <th className="text-left p-2">Date</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && votes.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  No data
                </td>
              </tr>
            )}

            {votes.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="p-2">{v.user.email || v.user.name}</td>
                <td className="p-2 truncate max-w-xs">
                  <a
                    href={v.pageUrl}
                    target="_blank"
                    className="text-blue-600 underline"
                  >
                    {v.contentId}
                  </a>
                </td>
                <td className="p-2">
                  {Math.floor(v.timeSeconds / 60)}:
                  {String(v.timeSeconds % 60).padStart(2, "0")}
                </td>
                <td className="p-2">
                  {v.voteType === "UP" ? "▲ Up" : "▼ Down"}
                </td>
                <td className="p-2">
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
