import { useState } from 'react'

import type { BreakdownSegment, SeriesPoint } from './insights.ts'

interface TrendChartProps {
  points: SeriesPoint[]
  label: string
  tone?: 'lime' | 'coral' | 'violet'
  comparisonPoints?: SeriesPoint[] | null
  comparisonLabel?: string
  comparisonTone?: 'lime' | 'coral' | 'violet' | 'muted'
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
  comparisonPoints = null,
  comparisonLabel,
  comparisonTone = 'muted',
}: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const series = points.length > 0 ? points : [{ label: 'N/A', value: 0 }]
  const secondarySeries = comparisonPoints !== null && comparisonPoints.length > 0
    ? comparisonPoints
    : null
  const maxValue = Math.max(
    ...series.map((point) => point.value),
    ...(secondarySeries?.map((point) => point.value) ?? []),
    1,
  )
  const polyline = buildPolyline(series, maxValue)
  const comparisonPolyline = secondarySeries === null ? null : buildPolyline(secondarySeries, maxValue)
  const visibleTickIndexes = buildVisibleTickIndexes(series.length)
  const activeIndex = hoveredIndex
  const activePoint = activeIndex === null ? null : series[activeIndex] ?? null
  const comparisonPoint = activeIndex === null || secondarySeries === null
    ? null
    : secondarySeries[Math.min(activeIndex, secondarySeries.length - 1)] ?? null
  const activeCoordinates = activePoint === null
    ? null
    : buildPointCoordinates(activePoint, activeIndex ?? 0, series.length, maxValue)
  const comparisonCoordinates = comparisonPoint === null || activeIndex === null
    ? null
    : buildPointCoordinates(
        comparisonPoint,
        Math.min(activeIndex, (secondarySeries?.length ?? 1) - 1),
        secondarySeries?.length ?? 1,
        maxValue,
      )

  return (
    <div className="trend-chart">
      <div className="chart-legend">
        <span className={`legend-swatch tone-${tone}`}>{label}</span>
        {comparisonLabel !== undefined ? (
          <span className={`legend-swatch tone-${comparisonTone}`}>{comparisonLabel}</span>
        ) : null}
      </div>
      <svg
        className="trend-chart-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={label}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
          const nextIndex = Math.round((relativeX / rect.width) * Math.max(series.length - 1, 0))
          setHoveredIndex(nextIndex)
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {comparisonPolyline !== null ? (
          <polyline
            points={comparisonPolyline}
            fill="none"
            className={`chart-line chart-line-${comparisonTone}`}
          />
        ) : null}
        <polyline
          points={polyline}
          fill="none"
          className={`chart-line chart-line-${tone}`}
        />
        {activeCoordinates !== null ? (
          <>
            <line
              x1={String(activeCoordinates.x)}
              x2={String(activeCoordinates.x)}
              y1="8"
              y2={String(CHART_HEIGHT - 22)}
              className="chart-hover-rule"
            />
            {comparisonCoordinates !== null ? (
              <circle
                cx={String(comparisonCoordinates.x)}
                cy={String(comparisonCoordinates.y)}
                r="3"
                className={`chart-dot chart-dot-${comparisonTone}`}
              />
            ) : null}
            <circle
              cx={String(activeCoordinates.x)}
              cy={String(activeCoordinates.y)}
              r="3.4"
              className={`chart-dot chart-dot-${tone}`}
            />
          </>
        ) : null}
        {series.map((point, index) => {
          const { x, y } = buildPointCoordinates(point, index, series.length, maxValue)
          const isVisibleTick = visibleTickIndexes.has(index)
          const tickLabel = formatTickLabel(point.label, series.length)

          return (
            <g key={`${point.label}-${index}`}>
              {hoveredIndex === null && index === series.length - 1 ? (
                <circle cx={String(x)} cy={String(y)} r="2.75" className={`chart-dot chart-dot-${tone}`} />
              ) : null}
              {isVisibleTick ? (
                <text
                  x={String(x)}
                  y={String(CHART_HEIGHT - 6)}
                  textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}
                  className="chart-axis-label"
                >
                  {tickLabel}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {activeCoordinates !== null && activePoint !== null ? (
        <div
          className={`chart-tooltip ${activeCoordinates.x < CHART_WIDTH * 0.18 ? 'is-left' : activeCoordinates.x > CHART_WIDTH * 0.82 ? 'is-right' : ''}`}
          style={{
            left: `${(activeCoordinates.x / CHART_WIDTH) * 100}%`,
            top: `${Math.max(activeCoordinates.y - 8, 18)}px`,
          }}
        >
          <div className="chart-tooltip-date">{activePoint.hoverLabel ?? activePoint.label}</div>
          <div className="chart-tooltip-values">
            <span className={`chart-tooltip-series tone-${tone}`}>
              <strong>{label}</strong>
              <em>{formatSeriesValue(activePoint)}</em>
            </span>
            {comparisonPoint !== null && comparisonLabel !== undefined ? (
              <span className={`chart-tooltip-series tone-${comparisonTone}`}>
                <strong>{comparisonLabel}</strong>
                <em>{formatSeriesValue(comparisonPoint)}</em>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
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

function buildPolyline(
  points: SeriesPoint[],
  maxValue: number,
): string {
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * CHART_WIDTH
      const y = CHART_HEIGHT - (point.value / maxValue) * (CHART_HEIGHT - 32) - 16
      return `${x},${y}`
    })
    .join(' ')
}

function buildPointCoordinates(
  point: SeriesPoint,
  index: number,
  pointCount: number,
  maxValue: number,
): { x: number; y: number } {
  const x = (index / Math.max(pointCount - 1, 1)) * CHART_WIDTH
  const y = CHART_HEIGHT - (point.value / maxValue) * (CHART_HEIGHT - 32) - 16
  return { x, y }
}

function buildVisibleTickIndexes(pointCount: number): Set<number> {
  if (pointCount <= 1) {
    return new Set([0])
  }

  const step = pointCount <= 6
    ? 1
    : pointCount <= 12
      ? 2
      : pointCount <= 24
        ? 4
        : 6
  const indexes = new Set<number>([0, pointCount - 1])

  for (let index = 0; index < pointCount; index += step) {
    indexes.add(index)
  }

  return indexes
}

function formatTickLabel(label: string, pointCount: number): string {
  if (pointCount <= 8) {
    return label
  }

  const [first, second] = label.split(' ')
  return second === undefined ? first : `${first} ${second}`
}

function formatSeriesValue(point: SeriesPoint): string {
  if (point.displayValue !== undefined) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(point.displayValue)
  }

  return new Intl.NumberFormat(undefined, {
    notation: point.value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: point.value >= 1000 ? 1 : 0,
  }).format(point.value)
}
