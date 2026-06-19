---
title: Why I Switched to Astro
description: After years of React-based static site generators, Astro's content-first approach won me over.
pubDatetime: 2026-02-08T00:00:00Z
author: Marco Gerstmann
featured: true
draft: false
---

I've built personal sites with Gatsby, Next.js, and Hugo. Each had trade-offs I accepted until I stopped accepting them.

## What I wanted

A static site that ships zero JavaScript by default. Markdown-first content. TypeScript support without ceremony. Good DX without a heavy build step.

## What Astro delivers

Astro's "islands architecture" means interactive components only hydrate where you need them. The rest is static HTML. For a blog, that means nearly every page ships no JS at all.

Content collections give you typed frontmatter out of the box. No more runtime validation of your markdown metadata — the build catches mistakes.

## The trade-off

Astro's ecosystem is younger than React's. Some things that are trivial in Next.js require a bit more manual wiring here. But for content sites, the simplicity-to-power ratio is hard to beat.
