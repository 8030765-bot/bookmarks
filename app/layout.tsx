import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./nova.css";
import LookBoot from "./components/LookBoot";
import EscapeClose from "./components/EscapeClose";
import { PageFeedback } from "./components/Help";

// served from our own domain at build time: no extra request to Google, no flash of the wrong font
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Theo's Bookmarks · 7A",
  description: "Shared school bookmarks — made by Theo 7A",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f4f5f8" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
        <PageFeedback />
        <LookBoot />
        <EscapeClose />
      </body>
    </html>
  );
}
