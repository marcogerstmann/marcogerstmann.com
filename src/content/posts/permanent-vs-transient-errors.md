---
title: 'Not Every Error Deserves a Retry: Permanent vs. Transient Failures in Event-Driven Systems'
description: 'How to distinguish permanent from transient errors in an SQS-based system, route poison messages to a dead-letter queue early, and keep the rest of your batch processing smoothly. A practical walkthrough in Go.'
pubDatetime: 2026-06-22T08:00:00Z
author: Marco Gerstmann
draft: false
---

When you process messages from a queue, you will deal with errors. That's a given. But not all errors are the same, and treating them the same way is one of the most common mistakes I see in event-driven architectures.

Some errors are transient. The database is temporarily unreachable. An external API timed out. These resolve themselves if you just wait a bit and try again.

Other errors are permanent. The message body is malformed JSON. A required field is missing. No matter how many times you retry, the outcome will be the same. Retrying a message with invalid JSON ten times is not optimism; it's a waste of compute.

In this post, I want to walk through how I handle this distinction in a real Go service that processes SQS messages on AWS Lambda, and why I think this pattern is worth adopting early in any event-driven system.

## The Problem

Picture an SQS queue feeding a Lambda function. Every time a message arrives, the Lambda picks it up and processes it. If the Lambda returns an error, SQS assumes the processing failed and makes the message visible again after a visibility timeout. The message gets retried.

This is great for transient issues. If DynamoDB had a brief hiccup, the retry will likely succeed. But what about a message with broken JSON? That message will be retried over and over until it hits the queue's maximum receive count, at which point SQS moves it to the dead-letter queue (DLQ) on its own. In the meantime, you've burned through several invocations for nothing, and worse, you might be blocking other messages in the batch from being processed.

The insight here is simple: if you can tell at processing time that an error is permanent, don't wait for SQS to figure it out. Route it to the DLQ yourself and move on.

## A Tiny Error Type

The foundation of this pattern is surprisingly small. I defined a `PermanentError` wrapper type in an `apperr` package:

```go
type PermanentError struct{ Err error }

func (e PermanentError) Error() string { return e.Err.Error() }
func (e PermanentError) Unwrap() error { return e.Err }
```

That's it. No error codes, no enums, no constants. Just a struct that wraps another error. The key detail is that it implements `Unwrap()`, which means Go's `errors.As` and `errors.Is` work through it. You can wrap any error as permanent, and callers further up the stack can detect it regardless of how deep the wrapping goes.

Everything that is *not* wrapped as a `PermanentError` is implicitly transient. I like this because it means you only have to opt in to the special case. The default behavior (retry) is the safe one.

## Where Permanent Errors Come From

Permanent errors are tagged at the point where you know the failure can never resolve. In my codebase, that happens in two main places.

**During message parsing.** If the SQS message body isn't valid JSON, or if a required message attribute like `tenant_id` is missing, that is a permanent failure. The message will never change.

```go
func parseBody(body string) (messageDTO, error) {
  var dto messageDTO
  if err := json.Unmarshal([]byte(body), &dto); err != nil {
    return messageDTO{}, apperr.PermanentError{
      Err: fmt.Errorf("invalid json body: %w", err),
    }
  }
  return dto, nil
}
```

**During domain validation.** The service layer does its own checks. For instance, if an insight has no ID, that is a data problem, not an infrastructure problem:

```go
func (s *service) Process(ctx context.Context, insight domain.Insight) (Result, error) {
  if strings.TrimSpace(insight.ID) == "" {
    return Result{}, apperr.PermanentError{Err: errors.New("missing id")}
  }
  // ...
}
```

Notice that errors from the database or external APIs are *not* wrapped as permanent. A failed DynamoDB write might be a throttle or a network blip. Those stay as regular errors and will be retried.

## The Handler: Two Paths

The SQS handler is where the decision happens. It loops through each record in the batch and tries to process it. The branching logic is the same for both the parsing step and the processing step:

```go
func (h *Handler) Handle(ctx context.Context, e events.SQSEvent) error {
  for _, rec := range e.Records {
    ev, err := mapRecordToDomain(rec)
    if err != nil {
      if errors.As(err, &apperr.PermanentError{}) {
        h.routeToDLQ(ctx, rec, err)
        continue
      }
      return err
    }

    i := mapIngestEventToInsight(ev)
    res, err := h.svc.Process(ctx, i)
    if err != nil {
      if errors.As(err, &apperr.PermanentError{}) {
        h.routeToDLQ(ctx, rec, err)
        continue
      }
      return err
    }

    // success logging...
  }
  return nil
}
```

Two paths, and the logic is clear:

- **Permanent error?** Send the message to the DLQ yourself and `continue` to the next record. The batch keeps going.
- **Transient error?** `return err`. This causes the Lambda invocation to fail, and SQS will retry the message.

There is an important subtlety with the transient path. When you return an error, SQS will retry *all unfinished messages in the batch*, including ones that might have already been processed successfully. That's why idempotency matters (a topic for another post), and it is also why catching permanent errors early is so valuable. You avoid poisoning the entire batch with a single bad message.

## Routing to the DLQ

When a message is permanently broken, the handler sends it to a separate DLQ explicitly via SQS. The DLQ publisher preserves the original message body and all its attributes, and tacks on a `failure_reason` attribute so you can see why it was rejected:

```go
func (p *SQSDLQPublisher) Send(ctx context.Context, record events.SQSMessage, reason error) error {
  attrs := make(map[string]types.MessageAttributeValue, len(record.MessageAttributes)+1)
  for k, v := range record.MessageAttributes {
    attrs[k] = types.MessageAttributeValue{
      DataType:    aws.String(v.DataType),
      StringValue: v.StringValue,
      BinaryValue: v.BinaryValue,
    }
  }
  attrs["failure_reason"] = types.MessageAttributeValue{
    DataType:    aws.String("String"),
    StringValue: aws.String(reason.Error()),
  }

  _, err := p.client.SendMessage(ctx, &sqs.SendMessageInput{
    QueueUrl:          aws.String(p.dlqURL),
    MessageBody:       aws.String(record.Body),
    MessageAttributes: attrs,
  })
  return err
}
```

This is better than relying on SQS's built-in DLQ redrive for permanent errors. The built-in redrive still works as a safety net for transient failures that exceed the maximum retry count, but for errors you *know* are permanent, explicit routing saves time and gives you better observability through that `failure_reason` attribute.

## Why This Matters

A few things that make this pattern worth the effort:

**Faster recovery.** A permanently broken message is routed to the DLQ on the first attempt instead of the fifth or tenth. The rest of the batch continues processing without delay.

**Better observability.** Every permanent error gets logged with its reason before being sent to the DLQ. You can set up alerts on the DLQ and immediately see *why* a message failed, not just *that* it failed.

**Less noise.** Without this pattern, your logs fill up with repeated errors from the same unprocessable message. With it, you get one log entry per permanent failure.

**Batch resilience.** A single poison message does not take down the entire batch. It gets removed and the rest proceed normally.

## Things to Watch Out For

This is not without tradeoffs. A few things I have learned:

**Be conservative about what you classify as permanent.** When in doubt, let it retry. A false positive (marking a recoverable error as permanent) means data loss. A false negative (retrying something that will never succeed) wastes some compute but eventually lands in the DLQ anyway via the SQS redrive policy.

**The DLQ send itself can fail.** Notice in my handler that if `routeToDLQ` fails, I log the error but still `continue` to the next record. This is a deliberate choice. The message will remain in the source queue and be retried, at which point the permanent error will be detected again. You could also choose to return an error here to force a full retry of the batch. There is no universally correct answer.

**You still need the SQS redrive policy.** The explicit DLQ routing handles the cases you can predict. The built-in redrive handles everything else: bugs in your handler, edge cases you didn't anticipate, Lambda timeouts, and so on. They complement each other.

## Wrapping Up

The permanent vs. transient distinction is one of those patterns that seems too simple to matter. But in practice, it is the difference between a system that degrades gracefully under bad input and one that grinds to a halt retrying messages it can never process.

The implementation cost is low: a single wrapper type, a couple of `errors.As` checks, and a DLQ publisher. The payoff is a system that is faster to recover, easier to debug, and more predictable under failure conditions.

If you are building anything that processes messages from a queue, I would recommend putting this in from day one. It is much easier than retrofitting it later.
