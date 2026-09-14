import type { Metadata } from "next";
import Script from "next/script";
import { SkipLink } from "@/components/SkipLink";
import { content } from "@/content/site";
import { markSvgDocument } from "@/lib/qr-mark";
import "./globals.css";

export function generateMetadata(): Metadata {
  const dict = content;

  return {
    metadataBase: new URL("https://pixstock.xyz"),
    title: {
      default: dict.site.titleDefault,
      template: dict.site.titleTemplate,
    },
    description: dict.site.description,
    icons: {
      icon: `data:image/svg+xml,${encodeURIComponent(markSvgDocument({ ink: "#e8e6e3", background: "#1c1a17" }))}`,
    },
    openGraph: {
      type: "website",
      siteName: dict.site.siteName,
      locale: "en_US",
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: dict.site.ogAlt }],
    },
    twitter: {
      card: "summary_large_image",
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  };
}

export const viewport = {
  themeColor: "#1c1a17",
};

function orgJsonLd(dict: typeof content) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://pixstock.xyz/#org",
        name: dict.site.siteName,
        url: "https://pixstock.xyz/",
        logo: "https://pixstock.xyz/og.jpg",
        email: "hello@pixstock.xyz",
        description: dict.site.orgDescription,
        sameAs: ["https://github.com/PixStock"],
      },
      {
        "@type": "WebSite",
        "@id": "https://pixstock.xyz/#site",
        name: dict.site.siteName,
        url: "https://pixstock.xyz/",
        inLanguage: "en",
        publisher: { "@id": "https://pixstock.xyz/#org" },
      },
    ],
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const dict = content;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* the theme before first paint, so the page never flashes the wrong one */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{if(localStorage.getItem('df-theme')==='light')document.documentElement.className+=' light';}catch(e){}})();`}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd(dict)) }}
        />
      </head>
      <body>
        {/* opt into motion only when JS is alive, so the first frame is readable */}
        <Script id="js-anim-init" strategy="beforeInteractive">
          {`(function () {
  var ok = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (ok) document.documentElement.className += ' js-anim';
})();`}
        </Script>

        <SkipLink label={dict.common.skipToContent} />

        {children}
      </body>
    </html>
  );
}
