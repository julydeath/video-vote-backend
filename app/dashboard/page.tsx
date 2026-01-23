"use client";
import { useEffect, useState } from "react";
import UserVotesTable from "./UserVotesTable";

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Checking extension login...");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "GOOGLE_TOKEN_RESPONSE") return;

      if (event.data?.token) {
        setToken(event.data.token);
        setStatus("✅ Logged in via extension");
      } else {
        setToken(null);
        setStatus(
          `❌ Not logged in via extension (${event.data?.error || "no_token"})`,
        );
      }
    }

    window.addEventListener("message", onMessage);

    // ask extension for token
    window.postMessage({ type: "REQUEST_GOOGLE_TOKEN" }, "*");

    // fallback: ask again after 1s (sometimes content_script loads after page)
    const t = setTimeout(() => {
      window.postMessage({ type: "REQUEST_GOOGLE_TOKEN" }, "*");
    }, 1000);

    return () => {
      clearTimeout(t);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard</h1>
      <p>{status}</p>

      {token && (
        <pre
          style={{ wordBreak: "break-all", background: "#f5f5f5", padding: 12 }}
        >
          {token.slice(0, 40)}... (token received)
          <UserVotesTable token={token} />
        </pre>
      )}
    </div>
  );
}
