---
title: 'A Queue Moves Work. A Bus Announces Facts.'
description: 'I run an SQS queue and an EventBridge bus in the same system, and they are not interchangeable. One carries work that must get done. The other carries things that already happened. Here is why I kept them separate, and what it cost me.'
pubDatetime: 2026-08-23T08:00:00Z
author: Marco Gerstmann
draft: false
---

For a long time my side project had exactly one piece of messaging infrastructure: an SQS queue between the ingest
endpoint and a worker Lambda. A webhook comes in, the endpoint validates and enqueues, the worker picks it up and does
the slow work. That is a well-understood shape and it served me well.

Then I wanted a second thing to happen after an item was processed.

Not *instead of* the existing processing. *After* it, and independently, run by something else entirely. In my case a
separate service that looks at a newly enriched item and tries to work out how it relates to everything else I have
saved.

My first instinct was to reuse what I already had. I have a queue. Queues move messages. Just put another message on it.

I am glad I stopped and thought about that for an afternoon, because it is the wrong shape, and the reason why turned
out to be one of the more useful distinctions I have internalised in the last year.

## The Temptation: Just Reuse the Queue

Here is what reusing the ingest queue would have meant.

The worker finishes processing an item and pushes a second message onto the same queue, something like
`{"type": "item_enriched", ...}`. Now the queue carries two kinds of message. Every consumer has to look at the type
field and decide whether this one is theirs.

That already smells, but it gets worse when you add the second consumer.

SQS is point to point. A message goes to *one* receiver. If two different services need to know that an item was
enriched, they cannot both read it off the same queue, because whichever one gets there first makes it disappear. You
end up either fanning out manually inside one consumer, which recouples everything you were trying to decouple, or
standing up a queue per consumer and having the producer write to all of them, which means the producer now knows about
every subscriber by name.

And the failure semantics get tangled. The ingest queue has a retry policy and a dead letter queue tuned for ingest
work. A subscriber that keeps failing would burn that retry budget and delay real ingestion. One consumer's bad deploy
becomes everyone's outage.

The queue was not built for this. It was built to move work from A to B reliably.

## Two Primitives, Two Jobs

The distinction I eventually wrote down for myself looks like this:

|                  | SQS work queue               | EventBridge bus                       |
|------------------|------------------------------|---------------------------------------|
| Carries          | Work that must be done       | Facts that already happened           |
| Losing a message | Data loss                    | A subscriber missed a notification    |
| Emitted          | On receipt, before the work  | After a successful business operation |
| Coupling         | Producer knows the consumer  | Producer knows nothing about anyone   |
| Shape            | Point to point, one consumer | Fan out, N subscribers                |

The line that does the most work for me is the second one. Ask what it means if a given message disappears. If the
answer is "the thing never got done", that is a task and it belongs on a work queue with retries and a DLQ. If the
answer is "somebody didn't hear about something that definitely happened", that is a fact, and facts want a bus.

Notice also the tense. A task is imperative and future facing: *process this item*. A fact is past tense and already
true: *this item was enriched*. If you find yourself naming an event with a verb in the imperative, you are probably
putting a task on a bus.

## A Fact Is Not a Task

Once I accepted they were different things, the event needed its own type, and I deliberately put it in the domain
package rather than next to the AWS code:

```go
// EventType names a domain fact, not a queue or transport detail.
type EventType string

const (
  InsightCreated      EventType = "InsightCreated"
  InsightEnriched     EventType = "InsightEnriched"
  KnowledgeUpdated    EventType = "KnowledgeUpdated"
  WeeklyPlanRequested EventType = "WeeklyPlanRequested"
)

// DomainEvent is the versioned envelope for "something happened" in the
// domain. It carries no AWS/transport concepts; adapters translate it to
// whatever wire format a subscriber needs.
type DomainEvent struct {
  EventID    string    `json:"event_id"`
  EventType  EventType `json:"event_type"`
  Version    int       `json:"version"`
  TenantID   string    `json:"tenant_id"`
  OccurredAt time.Time `json:"occurred_at"`
  Payload    any       `json:"payload"`
}
```

There is no EventBridge in that file. No `PutEventsRequestEntry`, no detail type, no bus ARN. The translation happens in
one adapter that maps `EventType` onto EventBridge's `DetailType` and stamps a `Source`. If I ever moved to Kafka or SNS
or something else, that adapter is the thing I would rewrite, and the contract the rest of the system depends on would
not move.

The `Version` field is worth a sentence. It versions the *envelope*, not the individual event types, and it starts at 1.
I have not needed to bump it yet. It costs four bytes and it means a breaking change to the envelope has somewhere to
go, instead of being discovered by a subscriber parsing garbage.

The `EventID` is derived, not random:

```go
func deterministicEventID(eventType EventType, subjectID string) string {
  sum := sha256.Sum256([]byte(string(eventType) + "|" + subjectID))
  return hex.EncodeToString(sum[:])
}
```

That is the same trick I use
for [idempotency on the ingest side](https://marcogerstmann.com/posts/idempotency-event-driven/), applied one layer out.
If the worker's SQS message gets redelivered and the work runs twice, the event published the second time carries an
identical id, so a subscriber can recognise it as something it has already seen. Random UUIDs would have made that
impossible.

## Two Ports, Not One

Because these are genuinely different concepts, I resisted the urge to hide them behind one interface. There are two
ports:

```go
// Raw bytes onto a work queue, for pipeline orchestration.
type EventPublisher interface {
  Publish(ctx context.Context, msg PublishMessage) error
}

// DomainEventPublisher announces a typed domain fact. Unlike EventPublisher
// (raw bytes on a work queue, for pipeline orchestration), this is for
// domain events that other bounded contexts subscribe to.
type DomainEventPublisher interface {
  Publish(ctx context.Context, event domain.DomainEvent) error
}
```

One takes bytes, because a work queue does not care what is in the message. One takes a typed domain object, because a
fact has a shape the domain owns.

A single generic `Publish(ctx, topic, payload)` would have been fewer lines. It also would have quietly made the two
things look the same at every call site, which is exactly the confusion I was trying to design my way out of.

## Every Subscriber Gets Its Own Queue

The piece that surprised me most was that the bus alone is not enough. EventBridge can invoke a Lambda directly, and for
a while I assumed that was the obvious wiring. It is simpler, and it is worse.

A rule that targets a Lambda directly gives you EventBridge's retry behaviour, not yours. No visibility timeout you
control, no DLQ you can drain and inspect, no backpressure. For an asynchronous consumer that calls an external API and
might be slow or down for ten minutes, that is not enough control.

So every subscriber attaches through the same small Terraform module: a rule on the bus, the subscriber's *own* queue,
its *own* DLQ, then its Lambda.

```hcl
resource "aws_cloudwatch_event_rule" "this" {
  name           = "${var.subscriber_name}-rule"
  event_bus_name = var.bus_name

  event_pattern = jsonencode({
    source = ["ipp.core"]
    detail-type = var.detail_types
  })
}

module "queue" {
  source                     = "../sqs"
  name                       = var.subscriber_name
  max_receive_count          = var.max_receive_count
  visibility_timeout_seconds = var.visibility_timeout_seconds
}
```

Subscribing is now variables in, ARNs out. More importantly, nobody shares a queue, so nobody shares a failure. A
subscriber that gets stuck in a redrive loop fills its own DLQ and delays its own work. Everything else keeps running.

Adding a subscriber is a Terraform change. The publisher does not know it happened, and that is the entire point.

## Keep the Payload Thin

One decision I would defend hard: the events carry almost nothing.

```go
type InsightCreatedPayload struct {
  InsightID string `json:"insight_id"`
  Source    string `json:"source"`
}
```

An id and a source. Not the item body, not the tags, not the timestamps beyond what the envelope already holds. If a
subscriber needs the full record, it reads the full record.

This is the difference between a notification channel and a replication channel. The moment events carry full entities,
subscribers start treating the event as the source of truth, and then every field you add to your domain model is a
breaking change on a wire format you now have several consumers of. Thin payloads keep the bus a bus.

## Things to Watch Out For

This is not free, and a few of these took me a while to see.

**The write and the publish are not one transaction.** The worker stores an item, then publishes the event. If the
publish fails I return a transient error so SQS redelivers, but on redelivery the conditional write short circuits (the
record already exists) and returns before reaching the publish. So a bus that stays broken drops the event while keeping
the write. Closing that properly means a published flag on the record or an outbox table. I have not built it, because
at my volume the failure mode is "one relationship does not get discovered", and I would rather leave a comment marking
the gap than carry an outbox I do not need yet. That is a judgement call and it would be the wrong one in a payments
system.

**At-least-once now stacks.** EventBridge retries delivery to the target, and the subscriber's SQS queue redelivers on
visibility timeout expiry. Two independent at-least-once hops on top of each other. Deterministic event ids are what
make this survivable. A subscriber that does not dedupe will double process, and it will do so rarely enough that you
will not notice until it matters.

**A missing queue policy fails silently.** This one cost me a genuinely stupid amount of time, so it is now a comment in
the module:

```hcl
# Without this, the rule shows healthy and matched events simply vanish -
# EventBridge needs explicit permission to SendMessage to a queue it targets.
```

The rule reports as healthy. The metrics look fine. The events just do not arrive. If you take one operational detail
away from this post, take that one.

**You added a latency hop.** A fact now travels worker to bus to subscriber queue to subscriber Lambda instead of being
a function call. Fine for asynchronous consumers where nobody is waiting. Completely wrong if a subscriber ever needs to
answer synchronously.

**It is one more thing to misconfigure.** Rules, targets, permissions and per subscriber queues are all state that can
drift independently of the code that publishes or consumes.

## Wrapping Up

If I had to compress this into one habit, it would be this: before you put a message somewhere, decide whether you are
handing over a task or announcing a fact.

Tasks want a work queue. One consumer, retries, a DLQ, backpressure, and a producer that knows who is on the other end.

Facts want a bus. Any number of subscribers, no coupling, and isolation so that one bad consumer is one bad consumer.

Trying to make one piece of infrastructure do both jobs is possible. I just found that every time I sketched it, the
design got harder to explain rather than easier, and "harder to explain" has become a reliable warning sign for me.

The full setup, including the Terraform module and the two ports, lives
in [the repository](https://github.com/marcogerstmann/insight-processing-platform) if you want to see how the pieces fit
together.
