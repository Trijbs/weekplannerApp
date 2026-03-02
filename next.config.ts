import type { NextConfig } from "next";
import path from "node:path";

function toAllowedDevHostname(value: string): string {
  const input = value.trim();
  if (!input) return "";

  // Accept either full URL (http://host:port) or plain host[:port].
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {}

  try {
    return new URL(`http://${input}`).hostname.toLowerCase();
  } catch {
    return input.toLowerCase();
  }
}

const allowedOriginsEnv = Array.from(
  new Set(
    (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
      .split(",")
      .map((origin) => toAllowedDevHostname(origin))
      .filter(Boolean),
  ),
);

const nextConfig: NextConfig = {
  allowedDevOrigins:
    allowedOriginsEnv.length > 0
      ? allowedOriginsEnv
      : [
          "localhost",
          "127.0.0.1",
          "192.168.1.246",
        ],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
