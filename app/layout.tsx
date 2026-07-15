import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./app-overrides.css";

export const metadata: Metadata = {
  title: "SPEDV Mobile",
  description: "Private, vollständige SPEDV-Oberfläche für iPhone und Browser.",
  applicationName: "SPEDV Mobile",
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
