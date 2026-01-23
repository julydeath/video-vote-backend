"use client";

import { useEffect, useState } from "react";
import AdminStats from "./AdminStats";
import AdminVotesTable from "./AdminVotesTable";

type MeResponse = {
  user?: {
    id: string;
    email?: string | null;
    role?: "USER" | "ADMIN";
  };
  error?: string;
};

export default function AdminDashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Checking extension login...");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // 1) Get token from extension
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "GOOGLE_TOKEN_RESPONSE") return;

      if (event.data?.token) {
        setToken(event.data.token);
        setStatus("✅ Logged in via extension");
      } else {
        setToken(null);
        setIsAdmin(null);
        setStatus(
          `❌ Not logged in via extension (${event.data?.error || "no_token"})`,
        );
      }
    }

    window.addEventListener("message", onMessage);

    // ask extension for token
    window.postMessage({ type: "REQUEST_GOOGLE_TOKEN" }, "*");

    // fallback ask again after 1s
    const t = setTimeout(() => {
      window.postMessage({ type: "REQUEST_GOOGLE_TOKEN" }, "*");
    }, 1000);

    return () => {
      clearTimeout(t);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  // 2) Once token exists, verify role via /api/me
  useEffect(() => {
    if (!token) return;

    setIsAdmin(null);

    fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j: MeResponse) => {
        setIsAdmin(j?.user?.role === "ADMIN");
      })
      .catch(() => setIsAdmin(false));
  }, [token]);

  // ---- UI states ----
  if (!token) {
    return (
      <div className="p-10">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-neutral-400 mt-2">{status}</p>
        <p className="text-neutral-500 mt-4">
          Please login via the Chrome extension first.
        </p>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="p-10">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-neutral-400 mt-2">Checking permissions…</p>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="p-10">
        <h1 className="text-2xl font-bold text-white">Access denied</h1>
        <p className="text-neutral-400 mt-2">You are not an admin.</p>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-neutral-400 mt-2">
          You have admin access. Filter votes by users, URL, date, etc.
        </p>
      </div>

      <AdminStats token={token} />
      <AdminVotesTable token={token} />
    </div>
  );
}
