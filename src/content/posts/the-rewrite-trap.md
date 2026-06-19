---
title: The Rewrite Trap
description: Why rewriting from scratch almost never works out the way you expect.
pubDatetime: 2026-06-05T00:00:00Z
author: Marco Gerstmann
draft: false
---

"Let's just rewrite it" is one of the most dangerous sentences in software engineering. I've said it. I've been wrong.

## Why rewrites are tempting

The existing codebase is messy. You understand the problem domain now in a way you didn't when the original was written. A clean slate feels like it would be faster. All of these things are true, and none of them mean a rewrite is a good idea.

## What goes wrong

Joel Spolsky wrote about this two decades ago, and it's still true. The old code is ugly because it encodes years of bug fixes, edge cases, and hard-won knowledge. A rewrite throws all of that away and starts re-discovering it from scratch.

Meanwhile, the existing product stops improving. Your users don't care about your clean architecture — they care about the feature they requested six months ago.

## The alternative

Incremental improvement. Strangle the old system piece by piece. Replace one module at a time behind stable interfaces. It's less satisfying but dramatically more likely to succeed.

## When to actually rewrite

When the old system is genuinely unmaintainable *and* the scope is small enough to finish in weeks, not months. A 500-line CLI tool? Sure, rewrite it. A production web app with 50,000 users? Almost certainly not.
