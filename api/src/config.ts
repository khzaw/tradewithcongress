const DEFAULT_DATABASE_URL =
  'postgresql://tradewithcongress:tradewithcongress@localhost:5432/tradewithcongress'
const DEFAULT_API_PORT = 8787

export interface ApiConfig {
  databaseUrl: string
  apiPort: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL
  const apiPort = parsePort(env.API_PORT)

  return {
    databaseUrl,
    apiPort,
  }
}

function parsePort(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_API_PORT
  }

  const port = Number.parseInt(rawValue, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid API_PORT value: ${rawValue}`)
  }

  return port
}
