import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSchedule, createScheduleRequest, validateSchedule, ScheduleValidationError } from '../src/index.js'

// Adapted from school-calendar's magicCalendar, chatRecurrence, and chat export
// tests. These exercise adapter/validation contracts with supplied model output;
// they do not measure a live model's ability to interpret the messages.
const context = { referenceDate: '2026-06-09', timeZone: 'Australia/Sydney' }
const event = (fields = {}) => ({
  title: 'Reading', date: '2026-09-07', startTime: '09:00',
  timeZone: 'Australia/Sydney', durationMinutes: 30, recurrence: null,
  source: { date: null, startTime: null, duration: null, recurrence: null },
  ...fields
})
const rule = (fields = {}) => ({ frequency: 'weekly', interval: 1, weekdays: [], count: 3, until: null, ...fields })
const output = (...events) => ({ events, questions: [] })

const scenarios = [
  {
    name: 'multiline school timetable keeps separate titles and durations',
    text: 'Monday 9am Reading 30 min\nTue 10:30am PE for 1 hour',
    events: [
      event({ date: '2026-06-08', source: { date: 'Monday', startTime: '9am', duration: '30 min', recurrence: null } }),
      event({ title: 'PE', date: '2026-06-09', startTime: '10:30', durationMinutes: 60,
        source: { date: 'Tue', startTime: '10:30am', duration: '1 hour', recurrence: null } })
    ]
  },
  {
    name: 'weekday check-in stays one bounded plan',
    text: 'Morning check-in weekdays at 8:45am for 15 min from July 1 to July 7',
    events: [event({ title: 'Morning check-in', date: '2026-07-01', startTime: '08:45', durationMinutes: 15,
      recurrence: rule({ weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'], count: null, until: '2026-07-07' }),
      source: { date: 'July 1', startTime: '8:45am', duration: '15 min', recurrence: 'weekdays' } })]
  },
  {
    name: 'next-month soccer does not invent a duration',
    text: 'I need to play soccer every Sat morning 9am for next month',
    events: [event({ title: 'Soccer', date: '2026-07-04', durationMinutes: null,
      recurrence: rule({ weekdays: ['SA'], count: null, until: '2026-07-31' }),
      source: { date: 'next month', startTime: '9am', duration: null, recurrence: 'every Sat' } })],
    questions: ['What is the duration for Soccer?']
  },
  {
    name: 'daily explicit range retains its inclusive end date',
    text: 'Piano practice daily at 9am for 30 min between July 1 and July 5',
    events: [event({ title: 'Piano practice', date: '2026-07-01',
      recurrence: rule({ frequency: 'daily', count: null, until: '2026-07-05' }),
      source: { date: 'July 1', startTime: '9am', duration: '30 min', recurrence: 'daily' } })]
  },
  {
    name: 'rolling past days are preserved without expanding occurrences',
    text: 'Reading daily at 8am for 30 min last 3 days',
    events: [event({ date: '2026-06-06', startTime: '08:00',
      recurrence: rule({ frequency: 'daily', count: 3 }),
      source: { date: 'last 3 days', startTime: '8am', duration: '30 min', recurrence: 'daily' } })]
  },
  {
    name: 'last day stays ambiguous rather than defaulting to yesterday',
    text: 'Piano practice last day at 9am for 30 min',
    events: [event({ title: 'Piano practice', date: null,
      source: { date: 'last day', startTime: '9am', duration: '30 min', recurrence: null } })],
    questions: ['What is the date for Piano practice?']
  },
  {
    name: 'weekly requests without an end do not inherit the app four-repeat default',
    text: 'Reading every Monday at 9am for 30 min starting September 7',
    events: [event({ recurrence: rule({ weekdays: ['MO'], count: null }),
      source: { date: 'September 7', startTime: '9am', duration: '30 min', recurrence: 'every Monday' } })],
    questions: ['When should Reading stop repeating, or how many occurrences should there be?']
  },
  {
    name: 'a series span does not replace the per-event duration',
    text: 'Reading daily at 8am for 30 min for three months starting July 1',
    events: [event({ date: '2026-07-01', startTime: '08:00',
      recurrence: rule({ frequency: 'daily', count: null, until: '2026-09-30' }),
      source: { date: 'July 1', startTime: '8am', duration: '30 min', recurrence: 'daily' } })]
  }
]

for (const scenario of scenarios) {
  test(`schedule adapter: ${scenario.name}`, async () => {
    const modelOutput = output(...scenario.events)
    const original = structuredClone(modelOutput)
    let calls = 0
    const result = await parseSchedule(scenario.text, {
      ...context,
      callLlm: async ({ messages, schema }) => {
        calls++
        const request = JSON.parse(messages.at(-1).content)
        assert.equal(request.text, scenario.text)
        assert.deepEqual(request.context, { ...context, weekStartsOn: 1, history: [] })
        assert.equal(schema.additionalProperties, false)
        return modelOutput
      }
    })
    assert.equal(calls, 1)
    assert.deepEqual(result.events, scenario.events)
    assert.deepEqual(result.questions, scenario.questions || [])
    assert.equal(result.status, scenario.questions ? 'needs_clarification' : 'ready')
    assert.deepEqual(modelOutput, original, 'validation must not mutate the adapter response')
  })
}

for (const [name, recurrence, date] of [
  ['daily', rule({ frequency: 'daily' }), '2026-09-07'],
  ['fortnightly', rule({ interval: 2, weekdays: ['MO'] }), '2026-09-07'],
  ['month-end', rule({ frequency: 'monthly' }), '2026-01-31'],
  ['leap-day yearly', rule({ frequency: 'yearly' }), '2028-02-29'],
  ['Sydney daylight-saving boundary', rule({ count: 8 }), '2026-09-07'],
  ['same-day inclusive end', rule({ count: null, until: '2026-09-07' }), '2026-09-07']
]) {
  test(`schedule recurrence: preserves ${name} for app-side expansion`, () => {
    const result = validateSchedule(output(event({ date, recurrence })))
    assert.equal(result.status, 'ready')
    assert.equal(result.events.length, 1)
    assert.deepEqual(result.events[0], event({ date, recurrence }))
    assert.equal(result.events[0].startTime, '09:00')
    assert.equal(result.events[0].durationMinutes, 30)
  })
}

for (const [name, recurrence] of [
  ['invalid end date', rule({ count: null, until: '2026-02-30' })],
  ['end preceding start', rule({ count: null, until: '2026-09-01' })],
  ['duplicate weekdays', rule({ weekdays: ['MO', 'MO'] })],
  ['unsupported weekday', rule({ weekdays: ['Monday'] })],
  ['fractional count', rule({ count: 3.5 })],
  ['zero count', rule({ count: 0 })],
  ['over-limit count', rule({ count: 1001 })],
  ['zero interval', rule({ interval: 0 })],
  ['fractional interval', rule({ interval: 1.5 })],
  ['unsupported frequency', rule({ frequency: 'fortnightly' })]
]) {
  test(`schedule recurrence: rejects ${name}`, () => {
    assert.throws(() => validateSchedule(output(event({ recurrence }))), ScheduleValidationError)
  })
}

test('clarification can combine a previous activity with the current duration answer', async () => {
  const history = ['Reading on September 7 at 9am', 'How long is Reading?']
  const result = await parseSchedule('45 minutes', {
    ...context, history,
    callLlm: async ({ messages }) => {
      assert.deepEqual(JSON.parse(messages.at(-1).content).context.history, history)
      return JSON.stringify(output(event({ durationMinutes: 45,
        source: { date: 'September 7', startTime: '9am', duration: '45 minutes', recurrence: null } })))
    }
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.events[0].durationMinutes, 45)
})

test('a cleared conversation cannot reuse evidence from old activity messages', async () => {
  await assert.rejects(parseSchedule('45 minutes', {
    ...context, history: [],
    callLlm: async () => output(event({ durationMinutes: 45,
      source: { date: 'September 7', startTime: '9am', duration: '45 minutes', recurrence: null } }))
  }), /Source phrase/)
})

test('today, visible week and Sunday week-start are passed separately to the adapter', () => {
  const request = createScheduleRequest('Piano daily at 9am for 30 min this displayed week', {
    ...context, referenceTime: '00:10', weekStartsOn: 7,
    visibleRange: { start: '2026-07-05', end: '2026-07-11' }
  })
  assert.deepEqual(JSON.parse(request.messages.at(-1).content).context, {
    ...context, referenceTime: '00:10', weekStartsOn: 7, history: [],
    visibleRange: { start: '2026-07-05', end: '2026-07-11' }
  })
})

for (const text of ['Export to Apple Calendar', 'export my calendar to Google Calendar', 'Generate an .ics file', 'Download ICS']) {
  test(`export adapter response remains no_schedule: ${text}`, async () => {
    const result = await parseSchedule(text, { ...context, callLlm: async () => output() })
    assert.deepEqual(result, { events: [], questions: [], status: 'no_schedule' })
  })
}

test('provider envelopes and fenced JSON require normalization in the caller adapter', async () => {
  const content = JSON.stringify(output(event()))
  for (const response of [
    { choices: [{ message: { content } }] },
    '```json\n' + content + '\n```',
    { events: [{ title: 'Reading', date: '2026-09-07', startTime: '09:00', durationMinutes: 30 }] }
  ]) {
    await assert.rejects(parseSchedule('Reading', { ...context, callLlm: async () => response }), ScheduleValidationError)
  }
})

test('app-owned event identifiers, icons and expanded repeat dates are rejected', () => {
  for (const extra of [{ id: 'reading' }, { iconKey: 'book' }, { repeatDates: [] }, { repeatId: 'series' }, { start: 0, end: 1800000 }]) {
    assert.throws(() => validateSchedule(output(event(extra))), /not allowed/)
  }
})

test('provider throttling is propagated once without retries or local fallback events', async () => {
  const error = Object.assign(new Error('Provider rate limited'), { status: 429 })
  let calls = 0
  await assert.rejects(parseSchedule('Reading weekdays 8am for 30 min next month', {
    ...context, callLlm: async () => { calls++; throw error }
  }), caught => caught === error)
  assert.equal(calls, 1)
})

test('preview edits cannot mutate the original model response', () => {
  const response = output(event({ recurrence: rule({ weekdays: ['MO'] }) }))
  const original = structuredClone(response)
  const preview = validateSchedule(response)
  preview.events[0].title = 'Changed'
  preview.events[0].source.date = 'Changed'
  preview.events[0].recurrence.weekdays.push('TU')
  preview.questions.push('Changed')
  assert.deepEqual(response, original)
})
