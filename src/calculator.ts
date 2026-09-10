export type HelperType = 'lab' | 'builder'

export type WorkdayState = 'idle' | 'available' | 'used'

export interface CalculationInput {
  startAt: Date
  remainingMinutes: number
  helperLevel: number
  workdayState: WorkdayState
  cooldownMinutes: number
}

export interface BoostRecord {
  startsAt: Date
  endsAt: Date
  helperProgressMinutes: number
  partial: boolean
}

export interface CalculationResult {
  baselineFinishAt: Date
  boostedFinishAt: Date
  savedMinutes: number
  boosts: BoostRecord[]
}

const WORKDAY_MINUTES = 23 * 60
const SESSION_MINUTES = 60

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

/**
 * Simulates continuous assignment. Normal upgrade progress always continues;
 * during a session the helper contributes `level` additional progress minutes
 * per real minute for up to one hour.
 */
export function calculateFinish(input: CalculationInput): CalculationResult {
  const { startAt, remainingMinutes, helperLevel, workdayState, cooldownMinutes } = input
  const baselineFinishAt = addMinutes(startAt, remainingMinutes)

  if (remainingMinutes <= 0 || helperLevel <= 0) {
    return {
      baselineFinishAt,
      boostedFinishAt: new Date(startAt),
      savedMinutes: Math.max(0, remainingMinutes),
      boosts: [],
    }
  }

  let now = new Date(startAt)
  let remaining = remainingMinutes
  let nextBoostAt = workdayState === 'used' ? addMinutes(startAt, cooldownMinutes) : new Date(startAt)
  let followingBoostBoundary = workdayState === 'idle'
    ? addMinutes(startAt, WORKDAY_MINUTES)
    : workdayState === 'used'
      ? addMinutes(startAt, cooldownMinutes + WORKDAY_MINUTES)
      : addMinutes(startAt, cooldownMinutes)
  const boosts: BoostRecord[] = []

  while (remaining > 0) {
    const waitMinutes = Math.max(0, (nextBoostAt.getTime() - now.getTime()) / 60_000)
    if (remaining <= waitMinutes) {
      now = addMinutes(now, remaining)
      remaining = 0
      break
    }

    remaining -= waitMinutes
    now = new Date(nextBoostAt)

    const totalRate = helperLevel + 1
    const realMinutesNeeded = remaining / totalRate
    const sessionRealMinutes = Math.min(SESSION_MINUTES, realMinutesNeeded)
    const helperProgressMinutes = sessionRealMinutes * helperLevel
    const endsAt = addMinutes(now, sessionRealMinutes)

    boosts.push({
      startsAt: new Date(now),
      endsAt,
      helperProgressMinutes,
      partial: sessionRealMinutes < SESSION_MINUTES,
    })

    remaining -= sessionRealMinutes * totalRate
    now = endsAt

    if (remaining <= 0) {
      remaining = 0
      break
    }

    nextBoostAt = followingBoostBoundary > now
      ? new Date(followingBoostBoundary)
      : new Date(now)
    followingBoostBoundary = addMinutes(followingBoostBoundary, WORKDAY_MINUTES)
  }

  const elapsedMinutes = (now.getTime() - startAt.getTime()) / 60_000

  return {
    baselineFinishAt,
    boostedFinishAt: now,
    savedMinutes: Math.max(0, remainingMinutes - elapsedMinutes),
    boosts,
  }
}

export function maxLevelFor(type: HelperType) {
  return type === 'lab' ? 12 : 8
}
