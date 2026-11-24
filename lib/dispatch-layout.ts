// ─────────────────────────────────────────────────────────────────────────────
// THE DISPATCH CALENDAR'S ARITHMETIC - pure, so every rule is a test
// (lib/__tests__/dispatch-layout.ts). The board draws a day the way a desk
// calendar does: time runs DOWN, a call is a block whose top is its start and
// whose height is how long it runs, and two calls that overlap in one column
// sit side by side rather than on top of each other.
//
// Every Date here is the READER's local time. The server never decides which
// hour a call falls in (it does not know the reader's clock).
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_CALL_MINUTES } from './service-calls'

/** The hours the board draws. A call outside them is pinned to the edge. */
export const DAY_START_HOUR = 6
export const DAY_END_HOUR = 21
/** Height of one hour, in px. */
export const HOUR_PX = 56
/** A drop or a click lands on the nearest quarter hour. */
export const SNAP_MINUTES = 15
/** The shortest a block is drawn, so a 10-minute call can still be read and grabbed. */
export const MIN_BLOCK_MINUTES = 30

export const BOARD_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60
export const BOARD_PX = (BOARD_MINUTES / 60) * HOUR_PX

/** Midnight of the day `d` falls on, local time. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Round to the nearest `step` minutes. */
export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step
}

/**
 * Where a call sits in a day column: `top` and `height` in px, measured from
 * DAY_START_HOUR. A call that starts before the board starts is pinned to the
 * top, one that ends after it to the bottom, and `clipped` says so (the block
 * shows its real time, which then disagrees with where it is drawn).
 * Null when the call is not on this day at all.
 */
export function blockGeometry(
  start: Date, end: Date | null, day: Date,
): { top: number; height: number; clipped: boolean } | null {
  const d0 = startOfDay(day).getTime()
  const s = start.getTime()
  const e = end && end.getTime() > s ? end.getTime() : s + DEFAULT_CALL_MINUTES * 60_000
  // On this day if it starts on it. (A call running past midnight is drawn on
  // the day it starts - service calls do not run overnight.)
  if (s < d0 || s >= d0 + 86_400_000) return null
  const boardStart = d0 + DAY_START_HOUR * 3_600_000
  const boardEnd = d0 + DAY_END_HOUR * 3_600_000
  const from = Math.min(Math.max(s, boardStart), boardEnd - MIN_BLOCK_MINUTES * 60_000)
  const to = Math.max(Math.min(Math.max(e, s + MIN_BLOCK_MINUTES * 60_000), boardEnd), from + MIN_BLOCK_MINUTES * 60_000)
  const px = (ms: number) => (ms / 3_600_000) * HOUR_PX
  return {
    top: px(from - boardStart),
    height: px(to - from),
    clipped: s < boardStart || e > boardEnd,
  }
}

/**
 * The time a point in a day column means: `offsetPx` from the top of the
 * column, snapped, and kept on the board.
 */
export function timeAtOffset(day: Date, offsetPx: number): Date {
  const minutes = snap((offsetPx / HOUR_PX) * 60)
  const kept = Math.min(Math.max(minutes, 0), BOARD_MINUTES - SNAP_MINUTES)
  const d = startOfDay(day)
  d.setMinutes(DAY_START_HOUR * 60 + kept)
  return d
}

/**
 * Side-by-side lanes for blocks that overlap in ONE column. Each block gets
 * its lane and how many lanes its cluster uses, so it is drawn at
 * `left = lane / lanes`, `width = 1 / lanes`. A cluster is a run of blocks
 * that overlap one another directly or through a chain; touching end-to-start
 * is NOT an overlap (a 9-10 and a 10-11 each take the full width - the same
 * rule `conflicts` uses for a double booking).
 */
export function lanes(blocks: readonly { id: string; top: number; height: number }[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...blocks].sort((a, b) => a.top - b.top || b.height - a.height)
  const out = new Map<string, { lane: number; lanes: number }>()
  let cluster: { id: string; lane: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity
  const close = () => {
    const n = laneEnds.length
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: n })
    cluster = []
    laneEnds = []
  }
  for (const b of sorted) {
    if (b.top >= clusterEnd) { close(); clusterEnd = -Infinity }
    let lane = laneEnds.findIndex(end => end <= b.top)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0) }
    laneEnds[lane] = b.top + b.height
    cluster.push({ id: b.id, lane })
    clusterEnd = Math.max(clusterEnd, b.top + b.height)
  }
  close()
  return out
}

/** "7 AM", "12 PM" - the hour labels down the side. */
export function hourLabel(h: number): string {
  const twelve = ((h + 11) % 12) + 1
  return `${twelve} ${h < 12 || h === 24 ? 'AM' : 'PM'}`
}

/** Monday of the week `d` falls in. */
export function weekStart(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
