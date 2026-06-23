---
title: 'Your Queue Will Deliver That Message Twice. Be Ready.'
description: 'A three-layer approach to idempotent message processing in Go, using content-derived keys, conditional writes, and short-circuit logic to handle duplicate deliveries without wasting compute.'
pubDatetime: 2026-06-23T08:00:00Z
author: Marco Gerstmann
draft: false
---

Most message systems, whether SQS, Kafka, or any other broker, default to at-least-once delivery. That "at least" is doing a lot of heavy lifting. It means your consumer might receive the same message two, three, or more times. If your processing logic creates a database record on every invocation, congratulations: you now have duplicates.

This is not a bug. It is a deliberate tradeoff. SQS standard queues trade exactly-once delivery for higher throughput and availability. Kafka consumers will re-read messages if they crash before committing an offset. Both systems put the responsibility for handling duplicates on you, the consumer. Some options exist to reduce duplicates at the broker level (SQS FIFO queues, Kafka's exactly-once semantics with transactions), but they come with throughput limits or added complexity. For most workloads, application-level idempotency is the more practical path.

In this post I want to walk through how I made message processing idempotent in a Go service. My specific stack is AWS Lambda, SQS, and DynamoDB, but the pattern itself is not tied to any of these. The same approach works with Kafka and PostgreSQL, RabbitMQ and MongoDB, or whatever combination you happen to be running. The three layers I describe are about the strategy, not the technology.

## Layer 1: A Deterministic Key

Idempotency starts with being able to answer one question: "Have I seen this before?" To answer that, you need a stable identifier that is the same every time the same logical event shows up.

I derive this key from the content of the event itself. No UUIDs, no timestamps, no database sequences. Just a SHA-256 hash of the fields that define the identity of the event:

```go
func buildIdempotencyKey(ev domain.IngestEvent) string {
  h := fmt.Sprintf("%s|%s|%s|%s",
    ev.TenantID,
    ev.Source,
    ev.EventType,
    ev.Highlight.ID,
  )

  sum := sha256.Sum256([]byte(h))
  return hex.EncodeToString(sum[:])
}
```

The inputs are the tenant, the source system, the event type, and the external highlight ID. If the same highlight from the same source arrives twice for the same tenant, it produces the same key. Every time, regardless of when it arrives or how many times it is delivered.

This is a deliberate choice over generating a random ID at ingestion time. A random UUID would be unique per request, which is exactly what you do not want. Two HTTP requests carrying the same highlight would produce two different IDs, and downstream processing would happily create two records. A content-derived key makes duplicates converge to the same identifier before they even hit the queue.

## Layer 2: Carry the Key Through the Pipeline

The idempotency key is computed early, at the point where the event enters the system. The ingest service assigns it as the event's ID and attaches it as an SQS message attribute:

```go
func (s *service) Enqueue(ctx context.Context, ev domain.IngestEvent) error {
  idempotencyKey := buildIdempotencyKey(ev)
  ev.ID = idempotencyKey

  body, err := json.Marshal(ev)
  if err != nil {
    return err
  }

  msg := ports.PublishMessage{
    Body: body,
    Attributes: map[string]string{
      "idempotency_key": idempotencyKey,
      "tenant_id":       ev.TenantID,
    },
  }

  return s.publisher.Publish(ctx, msg)
}
```

The key travels in two places: inside the message body (as the event's `id` field) and as a message attribute. The attribute makes it available to the consumer without parsing the body, which is useful for logging and routing. But the body is the source of truth.

On the consumer side, the SQS worker reads the `idempotency_key` attribute and uses it as the insight's ID for storage. Same key in, same ID out. The pipeline is a straight line from ingestion to storage with no point where the identity of the event can diverge.

## Layer 3: Conditional Writes in DynamoDB

The key alone does not prevent duplicates. You also need the storage layer to enforce uniqueness. I use DynamoDB's conditional expressions for this:

```go
func (r *InsightAdapter) CreateIfAbsent(ctx context.Context, insight domain.Insight) (bool, error) {
  // ... marshal the item ...

  _, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
    TableName:           aws.String(r.tableName),
    Item:                av,
    ConditionExpression: aws.String("attribute_not_exists(#pk)"),
    ExpressionAttributeNames: map[string]string{
      "#pk": "pk",
    },
  })

  if err == nil {
    return true, nil
  }

  if _, ok := errors.AsType[*types.ConditionalCheckFailedException](err); ok {
    return false, nil
  }

  return false, err
}
```

The `attribute_not_exists(#pk)` condition means: only write this item if nothing with the same partition key exists yet. If the item is already there, DynamoDB returns a `ConditionalCheckFailedException`. Instead of treating that as an error, the adapter returns `(false, nil)`: "not inserted, but nothing went wrong."

This is the actual deduplication mechanism. The idempotency key ensures that duplicate events map to the same primary key, and the conditional write ensures that only the first one gets persisted. The second, third, or tenth delivery of the same message simply bounces off the condition.

## Short-Circuiting Downstream Work

The boolean return from `CreateIfAbsent` is not just bookkeeping. The service layer uses it to skip expensive downstream work:

```go
func (s *service) Process(ctx context.Context, insight domain.Insight) (Result, error) {
  inserted, err := s.repo.CreateIfAbsent(ctx, insight)
  if err != nil {
    return Result{}, err
  }
  if !inserted {
    return Result{Inserted: false}, nil
  }

  // Enrichment via LLM, update, etc.
  // Only runs for genuinely new insights.
}
```

If the insight already exists, processing stops immediately. No LLM call, no update, no wasted compute. This matters because the enrichment step calls an external API, which costs real money per invocation. Without this short-circuit, every SQS redelivery would trigger another API call for an insight that is already fully processed.

## Why Not Just Use SQS FIFO?

It is a fair question. FIFO queues have built-in deduplication based on a `MessageDeduplicationId`. If you send the same deduplication ID within a five-minute window, SQS drops the duplicate before it ever reaches your consumer.

There are a few reasons I went with application-level idempotency instead:

**The deduplication window is five minutes.** If the same event arrives six minutes later (say, from a webhook retry or a reprocessing job), FIFO will not catch it. Application-level idempotency has no time window. The conditional write in DynamoDB will reject the duplicate whether it arrives five seconds or five months later.

**FIFO queues have lower throughput.** Standard queues can handle nearly unlimited messages per second. FIFO queues are limited to 300 messages per second per group (or 3,000 with batching). For a side project this does not matter much, but it is a constraint worth knowing about.

**Idempotency protects more than just the queue.** Even if the queue perfectly deduplicates, your Lambda might fail halfway through processing and get retried. The message is not a duplicate from SQS's perspective, but the processing is. Application-level idempotency handles this case too.

That said, FIFO queues and application-level idempotency are not mutually exclusive. You can use FIFO as a first line of defense to reduce duplicates reaching your consumer, and keep the conditional write as a safety net. For my use case, the standard queue with application-level idempotency was simpler and sufficient.

## The Full Picture

Zooming out, the idempotency guarantee flows through three layers:

1. **Deterministic key generation** from event content, so the same logical event always produces the same ID.
2. **Key propagation** through the message pipeline, so the identity is preserved from ingestion to storage.
3. **Conditional writes** at the storage layer, so the database enforces uniqueness even when the application delivers the same event multiple times.

Each layer serves a purpose. Without the deterministic key, duplicates would have different IDs and slip past the conditional write. Without the conditional write, the key would just be a label with no enforcement. Without propagating the key through the pipeline, ingestion and processing would disagree on what "the same event" means.

## Practical Notes

A few things I have learned from running this in practice:

**Hash collisions are not a real concern here.** SHA-256 has a 256-bit output. The probability of two different events producing the same key is astronomically low. You will run out of DynamoDB capacity units long before you hit a collision.

**Be careful about what goes into the key.** Only include fields that define the identity of the event, not fields that might change between deliveries. Timestamps, for instance, should not be part of the key. If the same highlight is delivered twice with different `received_at` values, you want those to map to the same key.

**The conditional write is cheap.** DynamoDB charges the same write capacity whether the condition passes or fails. You are not paying extra for deduplication. The only cost you save is the downstream work you skip.

**Log the deduplication.** When `CreateIfAbsent` returns `false`, the service returns `Result{Inserted: false}`. The worker handler logs this, which gives you visibility into how often duplicates actually arrive. If you see a spike, it might indicate an issue with the upstream publisher or the source system.

## Wrapping Up

Idempotency in an event-driven system is not a single mechanism. It is a property that emerges from a few simple decisions working together: derive identifiers from content, carry them through the pipeline, and enforce uniqueness at the storage layer.

None of these pieces are clever or novel. A hash function, an SQS message attribute, a DynamoDB condition expression. But together they give you a system that handles duplicate deliveries gracefully, skips redundant work, and does not require you to think about "what if this message arrives twice" at every step of the processing logic.
