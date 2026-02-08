"use client";

import { useEffect, useState } from "react";

type Segment = {
  start: number;
  dur: number;
  text: string;
};

export default function TranscriptViewer({
  token,
  contentId,
}: {
  token: string;
  contentId: string;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contentId) return;

    fetch(`/api/content/${encodeURIComponent(contentId)}/transcript`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => {
        setSegments(j.segments || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [contentId, token]);

  if (loading) return <div>Loading transcript…</div>;
  if (!segments.length)
    return <div className="text-gray-500">No transcript available.</div>;

  return (
    <div className="space-y-3 max-h-[70vh] overflow-auto border rounded p-4 bg-white">
      {segments.map((s, i) => (
        <div
          key={i}
          className="flex gap-4 text-sm leading-relaxed hover:bg-gray-50 p-2 rounded"
        >
          <div className="w-16 shrink-0 font-mono text-gray-500">
            {Math.floor(s.start / 60)}:{String(s.start % 60).padStart(2, "0")}
          </div>
          <div>{s.text}</div>
        </div>
      ))}
    </div>
  );
}
