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

        {/* Failsafe for the case the <noscript> block can't cover: JS that
            loads and then throws. Reveal targets pre-hide themselves in the
            markup, so a crash anywhere in the tree leaves the page blank with
            no error visible to the person holding the phone.

            After 6s — past the transition watchdog, so a slow-but-working
            transition won't trip it — check whether anything currently *in the
            viewport* is still hidden. Off-screen elements are excluded because
            scroll-triggered reveals are legitimately hidden until scrolled to.
            If something on screen is stuck, force everything visible. Motion is
            lost; the content is not. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){try{
var n=document.querySelectorAll('[data-reveal],.reveal-item'),stuck=false;
for(var i=0;i<n.length;i++){var e=n[i],r=e.getBoundingClientRect();
if(r.bottom<0||r.top>innerHeight)continue;var s=getComputedStyle(e);
if(s.opacity==='0'||s.visibility==='hidden'){stuck=true;break}}
if(stuck){var t=document.createElement('style');
t.textContent='[data-reveal]{opacity:1!important;transform:none!important;clip-path:none!important}.reveal-item{visibility:visible!important}.reveal-mask{display:none!important}';
document.head.appendChild(t);
console.warn('[reveal] failsafe fired — content was stuck hidden')}
}catch(err){}},6000)`,
          }}
        />
      </head>
      <body className="min-h-full">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
