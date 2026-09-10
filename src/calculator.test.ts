import { describe, expect, it } from 'vitest'
import { calculateFinish, maxLevelFor } from './calculator'

const startAt = new Date('2026-09-09T10:00:00+08:00')

describe('calculateFinish', () => {
  it('applies an immediately available helper', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 10 * 60,
      helperLevel: 2,
      workdayState: 'idle',
      cooldownMinutes: 0,
    })

    expect(result.boosts).toHaveLength(1)
    expect(result.boostedFinishAt.toISOString()).toBe(new Date('2026-09-09T18:00:00+08:00').toISOString())
    expect(result.savedMinutes).toBe(120)
  })

  it('waits for cooldown when the helper was already used', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 5 * 60,
      helperLevel: 4,
      workdayState: 'used',
      cooldownMinutes: 6 * 60,
    })

    expect(result.boosts).toHaveLength(0)
    expect(result.boostedFinishAt.toISOString()).toBe(new Date('2026-09-09T15:00:00+08:00').toISOString())
  })

  it('uses the current workday reset for an unused helper', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 20 * 60,
      helperLevel: 2,
      workdayState: 'available',
      cooldownMinutes: 5 * 60,
    })

    expect(result.boosts).toHaveLength(2)
    expect(result.boosts[1].startsAt.toISOString()).toBe(new Date('2026-09-09T15:00:00+08:00').toISOString())
  })

  it('can work again after finishing when the shared reset occurs mid-session', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 15 * 60,
      helperLevel: 2,
      workdayState: 'available',
      cooldownMinutes: 30,
    })

    expect(result.boosts[1].startsAt.toISOString()).toBe(new Date('2026-09-09T11:00:00+08:00').toISOString())
  })

  it('handles completion partway through a helper session', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 30,
      helperLevel: 2,
      workdayState: 'idle',
      cooldownMinutes: 0,
    })

    expect(result.boosts[0].partial).toBe(true)
    expect(result.boostedFinishAt.toISOString()).toBe(new Date('2026-09-09T10:10:00+08:00').toISOString())
    expect(result.savedMinutes).toBe(20)
  })

  it('finishes during an already active helper session', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 90,
      helperLevel: 8,
      workdayState: 'working',
      cooldownMinutes: 0,
      activeRemainingMinutes: 60,
    })

    expect(result.boosts).toHaveLength(1)
    expect(result.boosts[0].partial).toBe(true)
    expect(result.boostedFinishAt.toISOString()).toBe(new Date('2026-09-09T10:10:00+08:00').toISOString())
  })

  it('waits for the derived workday boundary after an active session', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 30 * 60,
      helperLevel: 2,
      workdayState: 'working',
      cooldownMinutes: 0,
      activeRemainingMinutes: 30,
    })

    expect(result.boosts[0].endsAt.toISOString()).toBe(new Date('2026-09-09T10:30:00+08:00').toISOString())
    expect(result.boosts[1].startsAt.toISOString()).toBe(new Date('2026-09-10T08:30:00+08:00').toISOString())
  })

  it('repeats boosts every 23 hours', () => {
    const result = calculateFinish({
      startAt,
      remainingMinutes: 60 * 60,
      helperLevel: 8,
      workdayState: 'idle',
      cooldownMinutes: 0,
    })

    expect(result.boosts.length).toBeGreaterThan(1)
    expect(
      (result.boosts[1].startsAt.getTime() - result.boosts[0].startsAt.getTime()) / 3_600_000,
    ).toBe(23)
  })
})

describe('helper limits', () => {
  it('returns current maximum helper levels', () => {
    expect(maxLevelFor('lab')).toBe(12)
    expect(maxLevelFor('builder')).toBe(8)
  })
})
