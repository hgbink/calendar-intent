import { scheduleSchema } from './schema.js'
import { buildMessages } from './prompt.js'
export { scheduleSchema } from './schema.js'

export class ScheduleValidationError extends Error {
  constructor(message) { super(message); this.name = 'ScheduleValidationError' }
}
const assert = (condition, message) => { if (!condition) throw new ScheduleValidationError(message) }
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const validZone = value => {
  if (typeof value !== 'string') return false
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}

// Same JSON schema is sent to the adapter and checked locally, even for providers
// without strict structured outputs. No external validation dependency is needed.
function validateShape(value, schema, path = 'result') {
  if (schema.anyOf) {
    assert(schema.anyOf.some(option => { try { validateShape(value, option, path); return true } catch { return false } }), `${path} has an invalid shape`)
    return
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  assert(types.includes(type) || (types.includes('integer') && Number.isInteger(value)), `${path} has an invalid type`)
  if (value === null) return
  if (schema.enum) assert(schema.enum.includes(value), `${path} has an unsupported value`)
  if (type === 'object') {
    for (const key of schema.required) assert(Object.hasOwn(value, key), `${path}.${key} is required`)
    for (const key of Object.keys(value)) {
      assert(Object.hasOwn(schema.properties, key), `${path}.${key} is not allowed`)
      validateShape(value[key], schema.properties[key], `${path}.${key}`)
    }
  }
  if (type === 'array') value.forEach((item, index) => validateShape(item, schema.items, `${path}[${index}]`))
}

export function createScheduleRequest(text, options = {}) {
  const { referenceDate, referenceTime, timeZone, weekStartsOn = 1, visibleRange, history = [] } = options
  assert(typeof text === 'string' && text.trim().length > 0 && text.length <= 20000, 'Provide a message of 1–20000 characters')
  assert(validDate(referenceDate), 'referenceDate must be a valid YYYY-MM-DD date')
  assert(referenceTime === undefined || validTime(referenceTime), 'referenceTime must be HH:mm')
  assert(validZone(timeZone), 'Provide a valid calendar timeZone')
  assert(Number.isInteger(weekStartsOn) && weekStartsOn >= 1 && weekStartsOn <= 7, 'weekStartsOn must be 1–7')
  assert(Array.isArray(history) && history.length <= 20 && history.every(item => typeof item === 'string' && item.length <= 20000), 'history must contain up to 20 text messages')
  if (visibleRange !== undefined) assert(validDate(visibleRange?.start) && validDate(visibleRange?.end) && visibleRange.start <= visibleRange.end, 'visibleRange requires valid ordered start/end dates')
  const context = { referenceDate, timeZone, weekStartsOn, history, ...(referenceTime ? { referenceTime } : {}), ...(visibleRange ? { visibleRange } : {}) }
  return { messages: buildMessages(text, context), schema: scheduleSchema }
}

export function validateSchedule(value, { text, history = [] } = {}) {
  validateShape(value, scheduleSchema)
  assert(value.events.length <= 50, 'At most 50 distinct event plans are allowed')
  const result = JSON.parse(JSON.stringify(value))
  const ask = question => { if (!result.questions.includes(question)) result.questions.push(question) }
  for (const event of result.events) {
    assert(event.title.trim().length > 0 && event.title.length <= 200, 'Event title must be 1–200 characters')
    assert(event.date === null || validDate(event.date), 'Invalid event date')
    assert(event.startTime === null || validTime(event.startTime), 'Invalid event startTime')
    assert(event.timeZone === null || validZone(event.timeZone), 'Invalid event timeZone')
    assert(event.durationMinutes === null || (event.durationMinutes > 0 && event.durationMinutes <= 10080), 'durationMinutes must be 1–10080')
    if (text !== undefined) {
      const sources = [text, ...history]
      for (const phrase of Object.values(event.source)) assert(phrase === null || (phrase.length > 0 && sources.some(source => source.includes(phrase))), 'Source phrase is not present in the supplied text/history')
    }
    for (const [field, label] of [['date', 'date'], ['startTime', 'start time'], ['durationMinutes', 'duration'], ['timeZone', 'time zone']]) {
      if (event[field] === null) ask(`What is the ${label} for ${event.title}?`)
    }
    const rule = event.recurrence
    if (!rule) continue
    assert(rule.interval >= 1 && rule.interval <= 365, 'Recurrence interval must be 1–365')
    assert(new Set(rule.weekdays).size === rule.weekdays.length, 'Duplicate weekdays')
    assert(rule.count === null || (rule.count >= 1 && rule.count <= 1000), 'Recurrence count must be 1–1000')
    assert(rule.until === null || validDate(rule.until), 'Invalid recurrence until date')
    assert(rule.count === null || rule.until === null, 'Specify count or until, not both')
    assert(!rule.until || !event.date || rule.until >= event.date, 'Recurrence end precedes its start')
    if (event.date && rule.weekdays.length) {
      const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(event.date).getUTCDay()]
      assert(rule.weekdays.includes(weekday), 'First event date conflicts with recurrence weekdays')
    }
    if (rule.count === null && rule.until === null) ask(`When should ${event.title} stop repeating, or how many occurrences should there be?`)
  }
  return { ...result, status: result.questions.length ? 'needs_clarification' : result.events.length ? 'ready' : 'no_schedule' }
}

export async function parseSchedule(text, options = {}) {
  const request = createScheduleRequest(text, options)
  assert(typeof options.callLlm === 'function', 'Provide a callLlm({ messages, schema }) adapter')
  const response = await options.callLlm(request)
  let value = response
  if (typeof response === 'string') {
    try { value = JSON.parse(response) } catch { throw new ScheduleValidationError('The model did not return valid JSON') }
  }
  return validateSchedule(value, { text, history: options.history })
}
