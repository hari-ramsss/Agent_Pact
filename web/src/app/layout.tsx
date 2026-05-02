import type { Metadata } from "next";
import { IBM_Plex_Mono, Orbitron, Syne } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const orbitron = Orbitron({
  variable: "--font-stats",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AgentPact Ecosystem Portal",
  description:
    "AgentPact is a trustless escrow and reputation layer for AI-agent work.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${plexMono.variable} ${orbitron.variable}`}
    >
      <body className="min-h-screen font-[var(--font-mono)] text-[#eef0ff] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
