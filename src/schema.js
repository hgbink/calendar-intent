const nullableString = { type: ['string', 'null'] }
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const nullableInteger = { type: ['integer', 'null'] }

export const scheduleSchema = object({
  events: { type: 'array', items: object({
    title: { type: 'string' },
    date: nullableString,
    startTime: nullableString,
    timeZone: nullableString,
    durationMinutes: nullableInteger,
    recurrence: { anyOf: [{ type: 'null' }, object({
      frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
      interval: { type: 'integer' },
      weekdays: { type: 'array', items: { type: 'string', enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] } },
      count: nullableInteger,
      until: nullableString
    })] },
    source: object({ date: nullableString, startTime: nullableString, duration: nullableString, recurrence: nullableString })
  }) },
  questions: { type: 'array', items: { type: 'string' } }
})
