const TICKER_DOMAIN_OVERRIDES: Record<string, string> = {
  AAPL: 'apple.com',
  ABBV: 'abbvie.com',
  ABT: 'abbott.com',
  AMZN: 'amazon.com',
  AVGO: 'broadcom.com',
  BRK: 'berkshirehathaway.com',
  BRKB: 'berkshirehathaway.com',
  COST: 'costco.com',
  CRM: 'salesforce.com',
  CSCO: 'cisco.com',
  CVX: 'chevron.com',
  DIS: 'thewaltdisneycompany.com',
  GILD: 'gilead.com',
  GM: 'gm.com',
  GOOG: 'google.com',
  GOOGL: 'google.com',
  HD: 'homedepot.com',
  IBM: 'ibm.com',
  INTC: 'intel.com',
  JNJ: 'jnj.com',
  JPM: 'jpmorganchase.com',
  KO: 'coca-colacompany.com',
  LIN: 'linde.com',
  MA: 'mastercard.com',
  MCD: 'mcdonalds.com',
  META: 'meta.com',
  MSFT: 'microsoft.com',
  NFLX: 'netflix.com',
  NVDA: 'nvidia.com',
  ORCL: 'oracle.com',
  PANW: 'paloaltonetworks.com',
  PEP: 'pepsico.com',
  PFE: 'pfizer.com',
  PG: 'pg.com',
  QCOM: 'qualcomm.com',
  TSM: 'tsmc.com',
  TSLA: 'tesla.com',
  UNH: 'uhc.com',
  V: 'visa.com',
  VZ: 'verizon.com',
  WMT: 'walmart.com',
  XOM: 'exxonmobil.com',
}

const ISSUER_DOMAIN_OVERRIDES: Record<string, string> = {
  'alphabet inc': 'google.com',
  'amazon.com, inc.': 'amazon.com',
  'amazon.com inc': 'amazon.com',
  'apple inc.': 'apple.com',
  'berkshire hathaway inc.': 'berkshirehathaway.com',
  'broadcom inc.': 'broadcom.com',
  'chevron corp': 'chevron.com',
  'cisco systems, inc.': 'cisco.com',
  'coca-cola co': 'coca-colacompany.com',
  'exxon mobil corp': 'exxonmobil.com',
  'home depot inc': 'homedepot.com',
  'jpmorgan chase & co.': 'jpmorganchase.com',
  'linde plc': 'linde.com',
  'mastercard inc': 'mastercard.com',
  'meta platforms inc': 'meta.com',
  'microsoft corporation': 'microsoft.com',
  'mcdonald\'s corp': 'mcdonalds.com',
  'netflix inc': 'netflix.com',
  'nvidia corporation': 'nvidia.com',
  'oracle corp': 'oracle.com',
  'palo alto networks inc': 'paloaltonetworks.com',
  'salesforce, inc.': 'salesforce.com',
  'tesla inc': 'tesla.com',
  'the walt disney company': 'thewaltdisneycompany.com',
  'visa inc.': 'visa.com',
  'walmart inc.': 'walmart.com',
}

const ISSUER_SUFFIX_PATTERN =
  /\b(incorporated|inc|corporation|corp|company|co|group|holdings|holding|plc|ltd|limited|class [a-z])\b/g
const NON_COMPANY_PATTERN =
  /\b(treasury|note|bond|bill|fund|etf|trust|municipal|county|state|united states|u\.s|us)\b/

interface ResolveIssuerLogoUrlOptions {
  ticker: string
  issuerName?: string | null
  assetName?: string | null
}

export function resolveIssuerLogoUrl({
  ticker,
  issuerName = null,
  assetName = null,
}: ResolveIssuerLogoUrlOptions): string | null {
  const normalizedTicker = ticker.trim().toUpperCase()
  const directDomain = TICKER_DOMAIN_OVERRIDES[normalizedTicker]

  if (directDomain !== undefined) {
    return buildGoogleFaviconUrl(directDomain)
  }

  const issuerCandidates = [issuerName, assetName]
    .filter((value): value is string => value !== null && value.trim() !== '')
    .map(normalizeIssuerKey)

  for (const candidate of issuerCandidates) {
    const override = ISSUER_DOMAIN_OVERRIDES[candidate]
    if (override !== undefined) {
      return buildGoogleFaviconUrl(override)
    }

    const heuristicDomain = buildHeuristicDomain(candidate)
    if (heuristicDomain !== null) {
      return buildGoogleFaviconUrl(heuristicDomain)
    }
  }

  return null
}

function normalizeIssuerKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[A-Z]{2,}\]/g, '')
    .replace(/-/g, ' ')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildHeuristicDomain(value: string): string | null {
  if (NON_COMPANY_PATTERN.test(value)) {
    return null
  }

  const base = value
    .replace(ISSUER_SUFFIX_PATTERN, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (base.length < 3) {
    return null
  }

  const collapsed = base.replace(/\s+/g, '')
  if (collapsed.length < 3) {
    return null
  }

  return `${collapsed}.com`
}

function buildGoogleFaviconUrl(domain: string): string {
  const query = new URLSearchParams({
    domain,
    sz: '128',
  })

  return `https://www.google.com/s2/favicons?${query.toString()}`
}
