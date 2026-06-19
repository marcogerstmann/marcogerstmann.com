---
title: Debugging with git bisect
description: How binary search through your commit history can pinpoint exactly when a bug was introduced.
pubDatetime: 2026-03-18T00:00:00Z
author: Marco Gerstmann
featured: false
draft: false
---

You know the bug exists now and didn't exist two weeks ago. Somewhere in those 47 commits, something broke. You could read each diff, or you could let git find it for you.

## How bisect works

`git bisect` performs a binary search across your commit history. You mark a known good commit and a known bad commit, and git checks out the midpoint for you to test.

```bash
git bisect start
git bisect bad          # current commit is broken
git bisect good abc123  # this older commit was fine
# git checks out the midpoint — test it
git bisect good         # or: git bisect bad
# repeat until git identifies the first bad commit
git bisect reset
```

In 47 commits, bisect finds the culprit in at most 6 steps.

## Automating it

If you have a test that reproduces the bug, you can automate the entire process:

```bash
git bisect start HEAD abc123
git bisect run npm test
```

Git will run your test at each midpoint and report the exact commit that introduced the failure.

## The prerequisite

Bisect works best when each commit is a coherent, buildable unit. This is one of the strongest practical arguments for clean commit history.
