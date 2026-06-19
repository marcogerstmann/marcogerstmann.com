---
title: "Git Worktrees: The Most Underrated Feature"
description: How git worktrees let you work on multiple branches simultaneously without stashing.
pubDatetime: 2026-01-25T00:00:00Z
author: Marco Gerstmann
draft: false
---

If you've ever stashed changes mid-flow to review a PR on another branch, git worktrees will change your life.

## The problem

Context-switching between branches is expensive. Not computationally — mentally. You stash, switch, review, switch back, pop, and hope nothing conflicts. Multiply that by a few PRs a day and it adds up.

## What worktrees solve

A worktree is a separate working directory linked to the same repo. Each worktree checks out a different branch. No stashing, no switching — just `cd` into the right directory.

```bash
git worktree add ../review-feature feature-branch
cd ../review-feature
# review, test, done
git worktree remove ../review-feature
```

## When to use them

Worktrees shine for code review, hotfixes while mid-feature, and running two branches side by side to compare behavior. They're lightweight — just a checkout, not a clone.
