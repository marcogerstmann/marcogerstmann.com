---
title: Shell Aliases That Actually Stuck
description: The handful of shell aliases I've kept for years, and why most aliases don't survive.
pubDatetime: 2026-04-28T00:00:00Z
author: Marco Gerstmann
featured: false
draft: false
---

I've added hundreds of shell aliases over the years. Maybe a dozen survived. Here are the ones that earned permanent residency.

## The survivors

```bash
alias gs="git status"
alias gd="git diff"
alias gl="git log --oneline -20"
alias gco="git checkout"
alias gcb="git checkout -b"
alias gp="git push"
alias gpf="git push --force-with-lease"
```

Notice a pattern — they're all git commands. Git's CLI is verbose enough that abbreviation genuinely saves time, and I use these dozens of times a day.

## Why most aliases die

An alias only sticks if you use it often enough to build muscle memory. That threshold is roughly "multiple times per day." Below that, you forget the alias exists and type the full command anyway.

## Functions over aliases

For anything with arguments or logic, shell functions are more flexible:

```bash
mkcd() { mkdir -p "$1" && cd "$1"; }
```

Simple, memorable, and worth the two seconds it saves every time.
