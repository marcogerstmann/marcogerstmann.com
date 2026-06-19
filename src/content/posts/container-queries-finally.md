---
title: Container Queries Are Finally Here
description: After years of waiting, container queries are shipping in all major browsers — and they change how we think about responsive design.
pubDatetime: 2026-04-02T00:00:00Z
author: Marco Gerstmann
featured: false
draft: false
---

Media queries ask "how wide is the viewport?" Container queries ask "how wide is my parent?" That distinction matters more than it sounds.

## The problem with media queries

A card component that looks great at 600px viewport width might be crammed into a 300px sidebar on a wider screen. Media queries can't help — they only know about the viewport.

## How container queries work

You declare a containment context on a parent element, then query its dimensions from child styles:

```css
.card-grid {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card {
    grid-template-columns: 1fr 1fr;
  }
}
```

The card layout now responds to its container, not the viewport. Move the same component to a different layout context and it adapts automatically.

## What this enables

Truly reusable components. Design systems where a component's responsive behavior is self-contained rather than dependent on where it's placed. This is what responsive design was always trying to be.
