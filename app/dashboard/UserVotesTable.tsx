"use client";

import { useEffect, useState } from "react";

type Vote = {
  id: string;
  contentId: string;
  timeSeconds: number;
  voteType: "UP" | "DOWN";
  pageUrl?: string;
  createdAt: string;
};

export default function UserVotesTable({ token }: { token: string }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(false);

  const [voteType, setVoteType] = useState("");
  const [q, setQ] = useState("");

  async function loadVotes() {
    setLoading(true);

    const params = new URLSearchParams();
    if (voteType) params.set("voteType", voteType);
    if (q) params.set("q", q);

    const res = await fetch(`/api/user/votes?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();
    setVotes(json.votes || []);
    setLoading(false);
  }

  useEffect(() => {
    loadVotes();
  }, []);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Your Activity</h2>
        <p className="text-sm text-neutral-400">
          Votes you’ve made across videos
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          value={voteType}
          onChange={(e) => setVoteType(e.target.value)}
        >
          <option value="">All votes</option>
          <option value="UP">Upvotes</option>
          <option value="DOWN">Downvotes</option>
        </select>

        <input
          className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 text-sm w-80 max-w-full placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
          placeholder="Search by URL or content ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          onClick={loadVotes}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          Apply filters
        </button>
      </div>

      {/* Table */}
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800 text-neutral-300">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Content</th>
              <th className="text-left px-4 py-3 font-medium">Time</th>
              <th className="text-left px-4 py-3 font-medium">Vote</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>

          <tbody className="bg-neutral-900 text-neutral-200">
            {loading && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-neutral-400"
                >
                  Loading activity…
                </td>
              </tr>
            )}

            {!loading && votes.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-neutral-400"
                >
                  No activity found
                </td>
              </tr>
            )}

            {votes.map((v) => (
              <tr
                key={v.id}
                className="border-t border-neutral-800 hover:bg-neutral-800/50 transition"
              >
                <td className="px-4 py-3 max-w-xs truncate">
                  {v.pageUrl ? (
                    <a
                      href={v.pageUrl}
                      target="_blank"
                      className="text-blue-400 hover:underline"
                    >
                      {v.contentId}
                    </a>
                  ) : (
                    <span>{v.contentId}</span>
                  )}
                </td>

                <td className="px-4 py-3 tabular-nums">
                  {Math.floor(v.timeSeconds / 60)}:
                  {String(v.timeSeconds % 60).padStart(2, "0")}
                </td>

                <td className="px-4 py-3">
                  {v.voteType === "UP" ? (
                    <span className="text-green-400 font-medium">▲ Up</span>
                  ) : (
                    <span className="text-red-400 font-medium">▼ Down</span>
                  )}
                </td>

                <td className="px-4 py-3 text-neutral-400">
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
