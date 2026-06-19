---
title: Environment Variables Done Right
description: Patterns for managing environment variables that scale from side projects to production systems.
pubDatetime: 2026-05-22T00:00:00Z
author: Marco Gerstmann
featured: false
draft: false
---

Every project starts with a `.env` file and good intentions. Most end with a sprawling mess of undocumented variables, half of which might not even be used anymore.

## Validate at startup

Don't let your app discover a missing variable when it first tries to use it — possibly hours into a deployment. Validate all required env vars at startup and fail fast.

```ts
const required = ["DATABASE_URL", "API_KEY", "SESSION_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}
```

## Use a schema

Tools like `zod` or `envalid` let you declare types and defaults alongside validation. Your config becomes self-documenting.

## Keep `.env.example` in sync

Every variable your app reads should be listed in `.env.example` with a placeholder value and a comment explaining what it does. This is the first file a new contributor looks at.

## Secrets vs. configuration

Not every env var is a secret. `PORT=3000` and `LOG_LEVEL=debug` are configuration. `DATABASE_URL` and `API_KEY` are secrets. Treat them differently — config can live in version control, secrets never should.
