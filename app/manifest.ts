import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SPEDV Mobile",
    short_name: "SPEDV",
    description: "Private mobile SPEDV-Oberfläche für Fahrer, Disposition und Spedition.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#090b10",
    theme_color: "#4567ff",
    categories: ["business", "productivity", "utilities"],
    lang: "de-DE",
    dir: "ltr",
    icons: [
      {
        src: "/icons/spedv-mobile.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/spedv-mobile.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
