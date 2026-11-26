import "./globals.css";
import type { ReactNode } from "react";
import { ServiceWorker } from "../components/ServiceWorker";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata = {
  title: "MarketPulse",
  description: "Tableau de bord boursier quotidien : marché, ETF, actions, découvertes",
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icon.svg`, apple: `${base}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "MarketPulse", statusBarStyle: "black-translucent" as const },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
        <footer className="px-4 pb-24 text-center lg:pb-6 lg:pl-64 text-[11px] text-slate-500">
          Information uniquement, pas un conseil en investissement.
        </footer>
        <ServiceWorker />
      </body>
    </html>
  );
}
