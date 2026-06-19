import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://marcogerstmann.com",
    title: "Marco Gerstmann",
    description:
      "Backend engineer writing about distributed systems, event-driven architecture, and Go. Based in Mallorca, Spain.",
    author: "Marco Gerstmann",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "Europe/Madrid",
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showBackButton: false,
    editPost: { enabled: false },
  },
  socials: [
    { name: "github",   url: "https://github.com/marcogerstmann" },
    { name: "linkedin", url: "https://www.linkedin.com/in/marcogerstmann" },
  ],
});
