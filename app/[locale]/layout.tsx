import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { SkipLink } from "@/components/SkipLink";
import { locales, hasLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import "../globals.css";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  const languages = Object.fromEntries(locales.map((l) => [l, `/${l}`]));

  return {
    metadataBase: new URL("https://pixstock.xyz"),
    title: {
      default: dict.site.titleDefault,
      template: dict.site.titleTemplate,
    },
    description: dict.site.description,
    alternates: { languages },
    icons: {
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%231c1a17'/%3E%3Cg fill='none' stroke='%23e8e6e3' stroke-width='4.5' stroke-linecap='round'%3E%3Cpath d='M24 13h27v27a11 11 0 0 1-11 11H24a11 11 0 0 1-11-11V24a11 11 0 0 1 11-11Z'/%3E%3Cpath d='M22 23h20M22 32h13M22 41h6'/%3E%3C/g%3E%3C/svg%3E",
    },
    openGraph: {
      type: "website",
      siteName: dict.site.siteName,
      locale,
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

function orgJsonLd(locale: Locale, dict: Awaited<ReturnType<typeof getDictionary>>) {
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
        inLanguage: locale,
        publisher: { "@id": "https://pixstock.xyz/#org" },
      },
    ],
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* the theme before first paint, so the page never flashes the wrong one */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{if(localStorage.getItem('df-theme')==='light')document.documentElement.className+=' light';}catch(e){}})();`}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd(locale, dict)) }}
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
