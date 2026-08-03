import type { Metadata } from "next";
import { ClientShell } from "@/components/ClientShell";
import { siteConfig } from "@/lib/siteConfig";
import "./globals.css";

export const metadata: Metadata = {
  // metadataBase makes the og:image (app/opengraph-image.tsx) resolve to an
  // absolute URL — without it, iPhone / Slack / Twitter previews stay blank.
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    url: siteConfig.url,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Reveal targets pre-hide in the markup to avoid a first-paint flash.
            If JS never runs, the reveal can't fire — so force them visible. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important;clip-path:none!important}.reveal-item{visibility:visible!important}.reveal-mask{display:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
