import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./app-overrides.css";

export const metadata: Metadata = {
  title: "SPEDV Mobile",
  description: "Private, vollständige SPEDV-Oberfläche für iPhone und Browser.",
  applicationName: "SPEDV Mobile",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SPEDV Mobile",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/spedv-mobile.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#090b10" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
