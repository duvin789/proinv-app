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

export const metadata: Metadata = {
  title: {
    default: "Almacén LuisGB | Gestión de inventario",
    template: "%s | Almacén LuisGB",
  },
  description:
    "Sistema de inventario con cálculos automáticos, trazabilidad y reportes.",
  applicationName: "Almacén LuisGB",
  icons: {
    icon: "/proinv-icon.svg",
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
