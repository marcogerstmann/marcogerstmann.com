# marcogerstmann.com

My personal website, writing about distributed systems, event-driven architecture, and Go.

## Stack

- Framework: [Astro](https://astro.build/)
- Theme: [AstroPaper v6](https://github.com/satnaing/astro-paper)
- Styling: [Tailwind CSS](https://tailwindcss.com/)
- Search: [Pagefind](https://pagefind.app/)

## Local dev

```bash
pnpm install       # install dependencies
pnpm dev           # dev server at localhost:4321
pnpm build         # type-check, build, and index search
pnpm preview       # preview the production build locally
```

## Content

- Posts live in `src/content/posts/` as `.md` or `.mdx` files.
- Site-wide config (title, socials, timezone, etc.) is in `astro-paper.config.ts`.
- The `About` page is at `src/content/pages/about.md`.
