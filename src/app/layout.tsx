import type { Metadata, Viewport } from "next";
import { Newsreader, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const serifDisplay = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const sansBody = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const monoCode = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Cerebro — Illuminate Your Knowledge",
    template: "%s · Cerebro",
  },
  description:
    "Offline-capable Progressive Web App for researchers and knowledge workers: notes, read-later annotations, topic mind maps, knowledge graphs, and idea incubation.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cerebro",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ed" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${serifDisplay.variable} ${sansBody.variable} ${monoCode.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
