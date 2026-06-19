---
title: "Small PRs, Big Impact"
description: Why keeping pull requests small is the highest-leverage habit for shipping faster.
pubDatetime: 2026-04-15T00:00:00Z
author: Marco Gerstmann
featured: false
draft: false
---

The single biggest improvement I've seen in team velocity doesn't come from better tooling or faster CI. It comes from smaller pull requests.

## The review bottleneck

A 50-line PR gets reviewed in 10 minutes. A 500-line PR sits in the queue for two days. It's not laziness — large diffs are genuinely harder to reason about. Reviewers skim, miss things, and rubber-stamp because the cognitive load is too high.

## How to split effectively

Most large PRs can be split along natural boundaries:

- **Refactor first, then feature.** Extract the structural change into its own PR.
- **Backend and frontend separately.** Even if they're logically one feature.
- **Tests as their own PR.** Especially when adding test infrastructure.

The goal isn't arbitrary smallness — it's each PR being a coherent, reviewable unit.

## The compounding effect

Small PRs merge faster. Faster merges mean less rebasing. Less rebasing means fewer conflicts. Fewer conflicts mean more time building. It compounds.
