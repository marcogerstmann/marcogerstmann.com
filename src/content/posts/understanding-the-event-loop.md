---
title: Understanding the Event Loop
description: A mental model for how JavaScript schedules and executes asynchronous work.
pubDatetime: 2026-01-10T00:00:00Z
author: Marco Gerstmann
draft: false
---

The event loop is one of those concepts that every JavaScript developer uses daily but few can explain precisely. Let's fix that.

## The single-threaded reality

JavaScript runs on a single thread. That sounds limiting, but the event loop makes it surprisingly capable. Instead of blocking on I/O, the runtime delegates work and picks up results when they're ready.

## Microtasks vs. macrotasks

Not all async callbacks are created equal. Promises resolve as microtasks — they run before the browser gets a chance to render. `setTimeout` and `setInterval` are macrotasks — they yield to rendering between executions.

```js
console.log("start");

setTimeout(() => console.log("timeout"), 0);

Promise.resolve().then(() => console.log("promise"));

console.log("end");
// start → end → promise → timeout
```

Understanding this ordering saves hours of debugging race conditions.

## When it matters

Most of the time, the distinction is academic. But when you're batching DOM updates, coordinating animations, or debugging flaky tests, knowing the event loop's scheduling rules is the difference between guessing and understanding.
