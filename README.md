# Calendar Intent

A small, dependency-free JavaScript library for extracting calendar dates, local
times, durations, and recurrence with an LLM. Designed for School Calendar and
inspired by [Gautam et al., NAACL 2024](https://aclanthology.org/2024.naacl-short.27/).
See [REFERENCES.md](./REFERENCES.md) for attribution and differences from the paper.

No training, Python runtime, API client, or credentials are bundled. You provide an
async LLM adapter; the library supplies messages and a JSON schema, then validates
the returned object. It never saves events or expands recurring schedules.

## Usage

Requires Node.js 18+ or a modern browser/bundler. There are no runtime dependencies.
Install the public npm package with `npm install @hgbink/calendar-intent`.

```js
import { parseSchedule } from '@hgbink/calendar-intent'

const result = await parseSchedule(
  'Violin tomorrow at 4pm for half an hour',
  {
    referenceDate: '2026-09-26', // actual local date in the calendar's zone
    timeZone: 'Australia/Sydney',
    callLlm: async ({ messages, schema }) => {
      // Implement this with your existing server-side LLM provider.
      // Return the parsed JSON object or its JSON string, not an API envelope.
      return yourLlmAdapter({ messages, schema })
    }
  }
)

if (result.status === 'needs_clarification') {
  console.log(result.questions)
} else if (result.status === 'ready') {
  console.log(result.events) // preview before saving
}
```

`yourLlmAdapter` above is a placeholder for your own function, not an exported API.
Use provider-enforced structured output with the supplied schema where supported.
For other providers, include the schema in your adapter's prompt and return JSON;
the same local validation runs either way. Do not put API keys in browser code.

## School Calendar integration

A local installation from the School Calendar project can use:

```sh
npm install ../calendar-intent
```

Then import from `@hgbink/calendar-intent`. Integration is not applied
to the app by this project. The existing `/.netlify/functions/magicgenerate` proxy
can serve as the transport: pass the generated messages to it and return the JSON
content from `choices[0].message.content`. Map `schema` to each provider's supported
structured-output format; do not assume all providers accept the same parameters.

Replace the existing event-generation prompt/normalizer with this library when
integrating. Expand each returned recurrence plan in application code exactly once.
Keep previews, storage, UUIDs, icons, recurrence expansion, and `.ics` export in the
app. Preserve each event's own duration and title during expansion.

## Context

- `referenceDate` (required): `YYYY-MM-DD`, used for today/tomorrow and relative dates.
- `timeZone` (required): a named calendar zone, e.g. `Australia/Sydney`.
- `referenceTime`: local `HH:mm`; needed for “in 30 minutes”.
- `weekStartsOn`: 1 for Monday through 7 for Sunday; defaults to Monday.
- `visibleRange`: `{ start, end }` date strings for explicitly visible-week requests.
- `history`: up to 20 prior message strings for references or clarification answers.
- `callLlm`: async function receiving `{ messages, schema }`.

## Output

```json
{
  "status": "ready",
  "events": [{
    "title": "Violin",
    "date": "2026-09-27",
    "startTime": "16:00",
    "timeZone": "Australia/Sydney",
    "durationMinutes": 30,
    "recurrence": null,
    "source": {
      "date": "tomorrow",
      "startTime": "4pm",
      "duration": "half an hour",
      "recurrence": null
    }
  }],
  "questions": []
}
```

Possible statuses: `ready`, `needs_clarification`, `no_schedule`. Missing values
stay `null`; the library does not choose a default date, time, or duration.
`source` contains verbatim evidence from the message/history. Context supplies the
calendar timezone. An export command is not an event-creation request.

Recurrence is `null` or an object containing `frequency`, `interval`, `weekdays`,
`count`, and `until`. For example:

```json
{"frequency":"weekly","interval":2,"weekdays":["MO"],"count":4,"until":null}
```

This describes four fortnightly Monday occurrences, including the first event.
`until` is an inclusive local date and cannot be combined with `count`. An unbounded
series triggers a question rather than silently generating endless events. A series
span such as “daily for three months” is distinct from each event's duration.

## Validation and limits

Exports: `parseSchedule`, `createScheduleRequest`, `validateSchedule`,
`scheduleSchema`, and `ScheduleValidationError`.

Validation checks JSON shape, calendar-valid dates, clock times, zones, positive
integer duration (up to seven days), recurrence bounds, weekday consistency, and
source phrase presence. Limits: 50 distinct plans, up to 1000 occurrences per rule,
and a 20,000-character current message. Missing fields create questions; malformed
or contradictory output throws `ScheduleValidationError`. Provider errors propagate.
No automatic retries or hidden API calls occur.

Validation cannot prove that the LLM interpreted the message correctly. In
particular, relative-date arithmetic, duration derivation, and event-to-phrase
association can still be wrong. Local times are not converted to UTC here: the app
must resolve daylight-saving gaps/overlaps and recurrence in the calendar's zone.
No live-model accuracy claims are made.

## Checks

```sh
npm test
npm run check
npm pack --dry-run
```

Tests use mocked LLM output and cover the adapter contract and validation, not
live extraction accuracy. Before production, evaluate the actual provider on real
messages: multiple activities, missing duration, “in” versus “for”, AM/PM ambiguity,
relative dates, weekday schedules, bounded series, leap dates, and DST transitions.
