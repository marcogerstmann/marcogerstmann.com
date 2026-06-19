---
title: What I Look for in Code Review
description: The mental checklist I run through when reviewing a pull request.
pubDatetime: 2026-05-10T00:00:00Z
author: Marco Gerstmann
featured: false
draft: false
---

Code review is a skill. Like any skill, having a framework makes you better at it. Here's the one I've settled on after years of reviewing.

## Correctness first

Does the code do what the PR description says it does? This sounds obvious, but it's easy to get distracted by style nits and miss a logic error. I read the description, form expectations, then check if the code meets them.

## Edge cases second

What happens with empty inputs? Null values? Concurrent access? The happy path is usually fine — bugs live at the boundaries.

## Clarity third

Could a new team member understand this code without the PR description? If the logic needs a comment to explain, it might need a refactor instead.

## What I skip

I don't comment on formatting — that's what linters are for. I don't bikeshed naming unless it's genuinely misleading. I don't suggest alternative approaches unless the current one has a concrete problem.

## The golden rule

Review the code you'd want to receive. Specific, actionable, kind.
