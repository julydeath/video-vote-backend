"use client";
import { useEffect, useState } from "react";
import UserDashboard from "./UserDashboard";

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Checking extension login...");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "GOOGLE_TOKEN_RESPONSE") return;

      if (event.data?.token) {
        setToken(event.data.token);
        setStatus("Logged in via extension");
      } else {
        setToken(null);
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

  if (!token) {
    return (
      <div className="app-shell px-6 py-12 md:px-10">
        <div className="glass-panel p-6 max-w-xl">
          <div className="text-sm text-[var(--muted)]">Reactor Dashboard</div>
          <h1 className="text-2xl font-semibold mt-2">Sign in required</h1>
          <p className="text-[var(--muted)] mt-3">{status}</p>
          <p className="text-sm text-[var(--muted)] mt-4">
            Please log in via the Chrome extension to view your reactions.
          </p>
        </div>
      </div>
    );
  }

  return <UserDashboard token={token} />;
}
