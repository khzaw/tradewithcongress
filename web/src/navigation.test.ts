import { describe, expect, test } from 'bun:test'

import { buildViewSearch, parseView } from './navigation.ts'

describe('parseView', () => {
  test('returns overview for an empty query string', () => {
    expect(parseView('')).toEqual({ kind: 'overview' })
  })

  test('returns official view for a valid official query parameter', () => {
    expect(parseView('?official=42')).toEqual({
      kind: 'official',
      officialId: '42',
    })
  })

  test('returns ticker view for a valid ticker query parameter', () => {
    expect(parseView('?ticker= msft ')).toEqual({
      kind: 'ticker',
      ticker: 'MSFT',
    })
  })

  test('ignores invalid official ids before falling back to ticker', () => {
    expect(parseView('?official=0&ticker=nvda')).toEqual({
      kind: 'ticker',
      ticker: 'NVDA',
    })
  })
})

describe('buildViewSearch', () => {
  test('returns empty search for overview', () => {
    expect(buildViewSearch({ kind: 'overview' })).toBe('')
  })

  test('builds a shareable official search string', () => {
    expect(buildViewSearch({ kind: 'official', officialId: '7' })).toBe(
      '?official=7',
    )
  })

  test('builds a shareable ticker search string', () => {
    expect(buildViewSearch({ kind: 'ticker', ticker: 'NVDA' })).toBe(
      '?ticker=NVDA',
    )
  })
})
