import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saral AI",
    short_name: "Saral AI",
    description:
      "Transform academic papers into professional educational artifacts with AI",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4f0",
    theme_color: "#111315",
    orientation: "portrait-primary",
    scope: "/",
    icons: [
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["education", "productivity"],
    prefer_related_applications: false,
  };
}
