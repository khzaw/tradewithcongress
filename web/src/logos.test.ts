import { describe, expect, test } from 'bun:test'

import { resolveIssuerLogoUrl } from './logos.ts'

describe('resolveIssuerLogoUrl', () => {
  test('uses explicit ticker mappings for well-known issuers', () => {
    expect(
      resolveIssuerLogoUrl({
        ticker: 'MSFT',
        issuerName: 'Microsoft Corporation',
      }),
    ).toContain('domain=microsoft.com')
  })

  test('uses explicit issuer mappings when the ticker is not mapped', () => {
    expect(
      resolveIssuerLogoUrl({
        ticker: 'GOOGL',
        issuerName: 'Alphabet Inc',
      }),
    ).toContain('domain=google.com')
  })

  test('falls back to a conservative heuristic domain for simple issuer names', () => {
    expect(
      resolveIssuerLogoUrl({
        ticker: 'CFLT',
        issuerName: 'Confluent Inc',
      }),
    ).toContain('domain=confluent.com')
  })

  test('returns null when a usable logo domain cannot be inferred', () => {
    expect(
      resolveIssuerLogoUrl({
        ticker: 'US10Y',
        issuerName: 'US Treasury Note',
      }),
    ).toBeNull()
  })
})
