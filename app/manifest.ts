import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPEDV Mobile",
    short_name: "SPEDV",
    description: "Private SPEDV-App mit vollständiger API-Abdeckung.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#090b10",
    theme_color: "#090b10",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/spedv-mobile.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
