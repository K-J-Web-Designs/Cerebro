import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cerebro — Illuminate Your Knowledge",
    short_name: "Cerebro",
    description:
      "Offline-capable knowledge workspace for notes, research exploration, read-later annotations, knowledge graphs, and idea incubation.",
    start_url: "/workspace",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#c87d1a",
    orientation: "any",
    categories: ["productivity", "education", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    share_target: {
      action: "/workspace/read-later",
      method: "GET",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
  };
}
