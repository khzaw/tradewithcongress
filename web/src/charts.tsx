import type { BreakdownSegment, SeriesPoint } from './insights.ts'

interface TrendChartProps {
  points: SeriesPoint[]
  label: string
  tone?: 'lime' | 'coral' | 'violet'
  pendingBenchmarkLabel?: string
}

interface RingChartProps {
  segments: BreakdownSegment[]
  centerLabel: string
}

const CHART_HEIGHT = 260
const CHART_WIDTH = 760

export function TrendChart({
  points,
  label,
  tone = 'lime',
  pendingBenchmarkLabel,
}: TrendChartProps) {
  const series = points.length > 0 ? points : [{ label: 'N/A', value: 0 }]
  const maxValue = Math.max(...series.map((point) => point.value), 1)
  const polyline = series
    .map((point, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * CHART_WIDTH
      const y = CHART_HEIGHT - (point.value / maxValue) * (CHART_HEIGHT - 32) - 16
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="trend-chart">
      <div className="chart-legend">
        <span className={`legend-swatch tone-${tone}`}>{label}</span>
        {pendingBenchmarkLabel !== undefined ? (
          <span className="legend-swatch pending">{pendingBenchmarkLabel}</span>
        ) : null}
      </div>
      <svg
        className="trend-chart-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={label}
      >
        {[0.2, 0.5, 0.8].map((ratio) => {
          const y = CHART_HEIGHT - ratio * (CHART_HEIGHT - 32) - 16
          return (
            <line
              key={ratio}
              x1="0"
              x2={String(CHART_WIDTH)}
              y1={String(y)}
              y2={String(y)}
              className="chart-grid-line"
            />
          )
        })}
        {pendingBenchmarkLabel !== undefined ? (
          <line
            x1="0"
            x2={String(CHART_WIDTH)}
            y1={String(CHART_HEIGHT / 2)}
            y2={String(CHART_HEIGHT / 2)}
            className="chart-pending-line"
          />
        ) : null}
        <polyline
          points={polyline}
          fill="none"
          className={`chart-line chart-line-${tone}`}
        />
        {series.map((point, index) => {
          const x = (index / Math.max(series.length - 1, 1)) * CHART_WIDTH
          const y = CHART_HEIGHT - (point.value / maxValue) * (CHART_HEIGHT - 32) - 16

          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={String(x)} cy={String(y)} r="4" className={`chart-dot chart-dot-${tone}`} />
              <text
                x={String(x)}
                y={String(CHART_HEIGHT - 2)}
                textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}
                className="chart-axis-label"
              >
                {point.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function RingChart({ segments, centerLabel }: RingChartProps) {
  const values = (segments.length > 0 ? [...segments] : [{ label: 'No data', value: 1 }]).sort(
    (left, right) => right.value - left.value,
  )
  const total = values.reduce((sum, segment) => sum + segment.value, 0)
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const segmentsWithOffsets = values.map((segment) => {
    const dash = (segment.value / total) * circumference
    return { ...segment, dash }
  })
  const offsets = segmentsWithOffsets.map((segment, index) => {
    const previousDash = segmentsWithOffsets
      .slice(0, index)
      .reduce((sum, value) => sum + value.dash, 0)

    return {
      ...segment,
      strokeDasharray: `${segment.dash} ${circumference - segment.dash}`,
      strokeDashoffset: -previousDash,
    }
  })

  return (
    <div className="ring-chart">
      <svg viewBox="0 0 140 140" className="ring-chart-svg" role="img" aria-label={centerLabel}>
        <circle cx="70" cy="70" r={String(radius)} className="ring-chart-track" />
        {offsets.map((segment, index) => {
          return (
            <circle
              key={`${segment.label}-${index}`}
              cx="70"
              cy="70"
              r={String(radius)}
              className={`ring-chart-segment ring-tone-${index % 5}`}
              strokeDasharray={segment.strokeDasharray}
              strokeDashoffset={String(segment.strokeDashoffset)}
            />
          )
        })}
        <text x="70" y="66" textAnchor="middle" className="ring-chart-value">
          {formatRingValue(total)}
        </text>
        <text x="70" y="84" textAnchor="middle" className="ring-chart-label">
          {centerLabel}
        </text>
      </svg>
      <ul className="ring-chart-key">
        {values.map((segment, index) => (
          <li key={`${segment.label}-${index}`}>
            <span className={`ring-key-dot ring-tone-${index % 5}`} />
            <span>{segment.label}</span>
            <strong>{formatRingValue(segment.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatRingValue(value: number): string {
  if (value >= 1000) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value)
}
