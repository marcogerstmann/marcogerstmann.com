---
title: Practical TypeScript Patterns I Use Daily
description: A handful of TypeScript patterns that have earned their place in my everyday toolkit.
pubDatetime: 2026-02-22T00:00:00Z
author: Marco Gerstmann
draft: false
---

TypeScript's type system is deep. You can spend weeks on type-level programming and still find new corners. But most real-world value comes from a small set of patterns.

## Discriminated unions over optional fields

Instead of making fields optional and checking for `undefined` everywhere, use a discriminant:

```ts
type Result =
  | { status: "ok"; data: string }
  | { status: "error"; message: string };
```

The compiler narrows the type after you check `status`, and you can't accidentally access `message` on a success result.

## `satisfies` for config objects

When you want type-checking without widening:

```ts
const routes = {
  home: "/",
  about: "/about",
} satisfies Record<string, string>;
```

You keep the literal types (`"/"`, `"/about"`) while the compiler still validates the shape.

## `as const` for exhaustive checks

Freeze arrays and objects at the type level. Combined with `satisfies`, this catches missing cases at compile time instead of runtime.
