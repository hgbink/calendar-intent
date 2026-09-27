# Schedule contract regression scenarios

Run all tests with `npm test`, or this suite with
`node --test test/schedule-contract.test.js`.

`schedule-contract.test.js` covers scheduling, conversation, and adapter
contracts. It requires no external project, UI framework, date library, provider,
or credentials, so the same cases run in GitHub Actions.

| Area | Coverage |
| --- | --- |
| Schedule requests and adapters | Multiline activities, weekday schedules, next-month soccer, explicit date ranges, rolling past days, ambiguous “last day”, provider response formats and throttling |
| Recurrence | Daily/fortnightly/month-end repeats, inclusive bounds, missing repeat limits, malformed recurrence, preserving local time and duration for app-side expansion |
| Calendar context | Reference date independent of the visible calendar week |
| Conversation and previews | Conversation evidence, cleared history, independent preview data |
| Export requests | Empty schedule responses for export commands |

The scenarios follow this library's contract: missing duration
and unbounded recurrence require clarification; “last day” remains ambiguous;
each recurrence is a single plan; IDs, icons, storage and expanded occurrences
belong to the app. The library's default week starts Monday; callers can pass
Sunday explicitly. Month-end, leap-day and DST cases verify preservation of
plans, not occurrence expansion or timezone conversion.

These are deterministic adapter and validation tests. Scenario dates and model
responses are supplied fixtures, not predictions made by a live model. Passing
them does not prove natural-language extraction, export-intent recognition, or
relative-date arithmetic accuracy. The scenario messages can also inform a
separate evaluation of an actual LLM adapter.
