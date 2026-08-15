import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function resolveMetadataBase() {
  const productionHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(
      /^https?:\/\//,
      "",
    ) || "";
  const candidates = [
    productionHost ? `https://${productionHost}` : "",
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "",
    "http://localhost:3000",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") return url;
    } catch {
      continue;
    }
  }

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: "Kadmiel Multimuebles | Gestión de inventario",
    template: "%s | Kadmiel Multimuebles",
  },
  description:
    "Inventario de Kadmiel Multimuebles con costos, trazabilidad y reportes.",
  applicationName: "Kadmiel Multimuebles",
  icons: {
    icon: [{ url: "/kadmiel-logo.png", type: "image/png" }],
    apple: [{ url: "/kadmiel-logo.png", type: "image/png" }],
  },
  openGraph: {
    title: "Kadmiel Multimuebles | Gestión de inventario",
    description:
      "Inventario de Kadmiel Multimuebles con costos, trazabilidad y reportes.",
    siteName: "Kadmiel Multimuebles",
    images: [
      {
        url: "/kadmiel-logo.png",
        width: 482,
        height: 452,
        alt: "Kadmiel Multimuebles",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('proinv-theme');var d=!t||t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=d;document.documentElement.dataset.density=localStorage.getItem('proinv-density')==='compact'?'compact':'comfortable'}catch(e){}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
