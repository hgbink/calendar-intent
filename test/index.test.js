import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSchedule, createScheduleRequest, validateSchedule, ScheduleValidationError } from '../src/index.js'
const context = { referenceDate: '2026-09-26', timeZone: 'Australia/Sydney' }
const text = 'Violin tomorrow at 4pm for 30 minutes'
const event = () => ({ title: 'Violin', date: '2026-09-27', startTime: '16:00', timeZone: 'Australia/Sydney', durationMinutes: 30, recurrence: null, source: { date: 'tomorrow', startTime: '4pm', duration: '30 minutes', recurrence: null } })
const response = e => ({ events: [e || event()], questions: [] })
test('passes prompt and schema to the injected adapter and validates JSON', async () => {
  const result = await parseSchedule(text, { ...context, callLlm: async ({ messages, schema }) => {
    assert.equal(schema.additionalProperties, false)
    assert.equal(JSON.parse(messages.at(-1).content).context.referenceDate, context.referenceDate)
    assert.equal(JSON.parse(messages.at(-1).content).text, text)
    assert.ok(messages.some(m => m.content.includes('in 30 minutes')))
    return JSON.stringify(response())
  } })
  assert.equal(result.status, 'ready')
  assert.equal(result.events[0].durationMinutes, 30)
})
test('missing duration is not defaulted', () => {
  const e = event(); e.durationMinutes = null; e.source.duration = null
  const result = validateSchedule(response(e))
  assert.equal(result.status, 'needs_clarification')
  assert.equal(result.events[0].durationMinutes, null)
})
test('rejects invented evidence', () => {
  assert.throws(() => validateSchedule(response(), { text: 'hello' }), /Source phrase/)
})
test('uses previous messages as source evidence', () => {
  assert.equal(validateSchedule(response(), { text: 'yes', history: [text] }).status, 'ready')
})
test('rejects invalid dates, time, duration and extra fields', () => {
  for (const change of [{ date: '2026-02-30' }, { startTime: '25:00' }, { durationMinutes: -1 }, { durationMinutes: '30' }, { injected: true }]) {
    assert.throws(() => validateSchedule(response({ ...event(), ...change })), ScheduleValidationError)
  }
})
test('keeps distinct activities and durations', () => {
  const result = validateSchedule({ events: [event(), { ...event(), title: 'Lunch', durationMinutes: 60 }], questions: [] })
  assert.deepEqual(result.events.map(e => e.durationMinutes), [30, 60])
})
test('requires a bounded recurrence without expanding it', () => {
  const e = { ...event(), date: '2026-10-05', recurrence: { frequency: 'weekly', interval: 1, weekdays: ['MO'], count: null, until: null } }
  assert.equal(validateSchedule(response(e)).status, 'needs_clarification')
  e.recurrence.count = 4
  assert.equal(validateSchedule(response(e)).events.length, 1)
  e.date = '2026-10-06'
  assert.throws(() => validateSchedule(response(e)), /weekdays/)
})
test('rejects conflicting recurrence bounds', () => {
  const e = { ...event(), recurrence: { frequency: 'daily', interval: 1, weekdays: [], count: 4, until: '2026-10-05' } }
  assert.throws(() => validateSchedule(response(e)), /count or until/)
})
test('validates context before spending an LLM call', async () => {
  let called = false
  await assert.rejects(parseSchedule(text, { ...context, referenceDate: '2026-02-30', callLlm: () => { called = true } }), /referenceDate/)
  assert.equal(called, false)
  assert.throws(() => createScheduleRequest(text, { ...context, timeZone: 'invalid' }), /timeZone/)
})
test('keeps the visible range separate from today', () => {
  const request = createScheduleRequest(text, { ...context, visibleRange: { start: '2026-12-07', end: '2026-12-13' } })
  const actual = JSON.parse(request.messages.at(-1).content).context
  assert.equal(actual.referenceDate, '2026-09-26')
  assert.equal(actual.visibleRange.start, '2026-12-07')
})
test('handles unrelated requests and malformed responses', async () => {
  assert.equal(validateSchedule({ events: [], questions: [] }).status, 'no_schedule')
  await assert.rejects(parseSchedule(text, { ...context, callLlm: async () => 'not JSON' }), /valid JSON/)
  await assert.rejects(parseSchedule(text, { ...context, callLlm: async () => { throw new Error('Provider unavailable') } }), /Provider unavailable/)
})
