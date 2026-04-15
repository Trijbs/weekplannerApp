import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

function resolveMetadataBase(): URL {
  const configuredUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    try {
      return new URL(configuredUrl);
    } catch {
      // Fall back to localhost when the configured value is not a valid URL.
    }
  }

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Weekplanner",
  description: "Weekplanning, urenregistratie en automatische notities",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${spaceGrotesk.variable} ${plexMono.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
