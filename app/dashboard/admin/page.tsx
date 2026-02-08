"use client";

import { useEffect, useState } from "react";
import AdminDashboard from "./AdminDashboard";

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

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "GOOGLE_TOKEN_RESPONSE") return;

      if (event.data?.token) {
        setToken(event.data.token);
        setStatus("Logged in via extension");
      } else {
        setToken(null);
        setIsAdmin(null);
        setStatus(
          `Not logged in via extension (${event.data?.error || "no_token"})`,
        );
      }
    }

    window.addEventListener("message", onMessage);

    window.postMessage({ type: "REQUEST_GOOGLE_TOKEN" }, "*");

    const t = setTimeout(() => {
      window.postMessage({ type: "REQUEST_GOOGLE_TOKEN" }, "*");
    }, 1000);

    return () => {
      clearTimeout(t);
      window.removeEventListener("message", onMessage);
    };
  }, []);

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

  if (!token) {
    return (
      <div className="app-shell px-6 py-12 md:px-10">
        <div className="glass-panel p-6 max-w-xl">
          <div className="text-sm text-[var(--muted)]">Admin Console</div>
          <h1 className="text-2xl font-semibold mt-2">Sign in required</h1>
          <p className="text-[var(--muted)] mt-3">{status}</p>
          <p className="text-sm text-[var(--muted)] mt-4">
            Please log in via the Chrome extension to continue.
          </p>
        </div>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="app-shell px-6 py-12 md:px-10">
        <div className="glass-panel p-6 max-w-xl">
          <div className="text-sm text-[var(--muted)]">Admin Console</div>
          <h1 className="text-2xl font-semibold mt-2">Verifying access…</h1>
          <p className="text-[var(--muted)] mt-3">
            Checking permissions for this account.
          </p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="app-shell px-6 py-12 md:px-10">
        <div className="glass-panel p-6 max-w-xl">
          <div className="text-sm text-[var(--muted)]">Admin Console</div>
          <h1 className="text-2xl font-semibold mt-2">Access denied</h1>
          <p className="text-[var(--muted)] mt-3">
            This account does not have admin permissions.
          </p>
        </div>
      </div>
    );
  }

  return <AdminDashboard token={token} />;
}
