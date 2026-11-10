const RENDER_API_BASE = "https://sales-backend.onrender.com";
const RAILWAY_API_BASE = "https://sales-analysis-api-production.up.railway.app";

function resolveDefaultApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";

  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }

  if (hostname.endsWith("railway.app")) return RAILWAY_API_BASE;

  // Render is the primary host; its static frontend and API are separate services.
  // GitHub Pages is deactivated, and custom domains can override this via VITE_API_BASE.
  return RENDER_API_BASE;
}

function resolveDefaultAgentApiBase() {
  if (typeof window === "undefined") return "http://localhost:8001";

  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8001";
  }

  return "https://sokolink-agent.onrender.com";
}

export const env = {
  apiBase: (import.meta.env.VITE_API_BASE || resolveDefaultApiBase()).replace(/\/+$/, ""),
  agentApiBase: (import.meta.env.VITE_AGENT_API_BASE || resolveDefaultAgentApiBase()).replace(/\/+$/, ""),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
};
