export type AppView =
  | { kind: 'overview' }
  | { kind: 'official'; officialId: string }
  | { kind: 'ticker'; ticker: string }

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/

export function parseView(search: string): AppView {
  const params = new URLSearchParams(search)
  const officialId = params.get('official')
  if (officialId !== null && POSITIVE_INTEGER_PATTERN.test(officialId)) {
    return { kind: 'official', officialId }
  }

  const rawTicker = params.get('ticker')
  const ticker = normalizeTicker(rawTicker)
  if (ticker !== null) {
    return { kind: 'ticker', ticker }
  }

  return { kind: 'overview' }
}

export function buildViewSearch(view: AppView): string {
  const params = new URLSearchParams()

  if (view.kind === 'official') {
    params.set('official', view.officialId)
  }

  if (view.kind === 'ticker') {
    params.set('ticker', view.ticker)
  }

  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

function normalizeTicker(rawTicker: string | null): string | null {
  if (rawTicker === null) {
    return null
  }

  const ticker = rawTicker.trim().toUpperCase()
  return ticker === '' ? null : ticker
}
