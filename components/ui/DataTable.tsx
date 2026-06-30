'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { colors } from '@/lib/tokens'

/**
 * Bespoke CSS-grid data table — pixel-matches the EVRA telephony mockup
 * ("GENERIC TELEPHONY-STYLE DATA TABLE"). No `@mui/x-data-grid`.
 *
 * Layout: outer card → decorative toolbar → horizontal-scroll container holding
 * a CSS-grid header row + zebra-striped CSS-grid body rows → footer with a real
 * `1–N of N` page label. Columns flagged `sticky` pin to the right edge (used for
 * the Actions column) with the row's background carried through so the sticky cell
 * reads as part of the row.
 */

export type DataTableColumn<R> = {
  /** Stable identifier; also used as React key for the cell. */
  key: string
  /** Header label (uppercased by the header styling). */
  label: ReactNode
  /** Cell + header text alignment. Default 'left'. */
  align?: 'left' | 'right' | 'center'
  /** A grid-template-columns fragment, e.g. '1.5fr', '200px', '84px'. */
  width: string
  /** Pin this column to the right edge (use for an Actions column). */
  sticky?: boolean
  /** Custom cell renderer. Falls back to `String(row[key])` when omitted. */
  render?: (row: R) => ReactNode
}

export type DataTableProps<R> = {
  columns: DataTableColumn<R>[]
  rows: readonly R[]
  /** Stable row id (React key). */
  getRowId: (row: R) => string | number
  /** Row click handler — sets `cursor:pointer` and fires on row click. */
  onRowClick?: (row: R) => void
  /** Decorative leading checkbox column (40px). Default false. */
  checkbox?: boolean
  /** Min grid width before horizontal scroll kicks in, e.g. '1080px'. */
  minWidth?: string
  /** Show the decorative Columns/Filters/Export + Search toolbar. Default true. */
  toolbar?: boolean
  /** Show the footer (rows-per-page + page label + pager). Default true. */
  footer?: boolean
  /** Body row height in px. Default 52. */
  rowHeight?: number
}

const CHECKBOX_COL = '40px'

/** Decorative checkbox square (matches the mockup — non-interactive for now). */
function CheckboxCell() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span
        style={{
          width: 15,
          height: 15,
          border: `1.5px solid ${colors.bg4}`,
          borderRadius: 3,
          display: 'inline-block',
        }}
      />
    </div>
  )
}

export default function DataTable<R>({
  columns,
  rows,
  getRowId,
  onRowClick,
  checkbox = false,
  minWidth,
  toolbar = true,
  footer = true,
  rowHeight = 52,
}: DataTableProps<R>) {
  // Optional working quick-filter (nice-to-have): filters rows whose rendered
  // text contains the query. Kept lightweight — searches String() of each cell.
  const [query, setQuery] = useState('')

  const gridTemplate = useMemo(
    () => (checkbox ? `${CHECKBOX_COL} ` : '') + columns.map(c => c.width).join(' '),
    [checkbox, columns],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      columns.some(col => {
        if (col.sticky) return false // skip Actions column
        const v = col.render ? undefined : (row as Record<string, unknown>)[col.key]
        return String(v ?? '').toLowerCase().includes(q)
      }),
    )
  }, [rows, columns, query])

  const justify = (align?: DataTableColumn<R>['align']) =>
    align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'

  const total = filtered.length

  return (
    <div
      style={{
        border: `1px solid ${colors.border2}`,
        borderRadius: 6,
        background: colors.bg1,
        overflow: 'hidden',
      }}
    >
      {/* ── Decorative toolbar (Columns / Filters / Export + Search) ── */}
      {toolbar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '8px 12px',
            borderBottom: `1px solid ${colors.border1}`,
            fontSize: 12,
            color: colors.fg2,
          }}
        >
          <span>▤ Columns</span>
          <span>⫶ Filters</span>
          <span>⬇ Export</span>
          <span style={{ flex: 1 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="🔍 Search…"
            aria-label="Search rows"
            style={{
              background: colors.bg2,
              border: `1px solid ${colors.border2}`,
              borderRadius: 4,
              padding: '5px 10px',
              color: colors.fg3,
              fontSize: 12,
              outline: 'none',
              width: 160,
            }}
          />
        </div>
      )}

      {/* ── Horizontal-scroll container ── */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}>
        {/* Header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridTemplate,
            minWidth,
            height: 42,
            background: colors.bg2,
            borderBottom: `1px solid ${colors.border1}`,
          }}
        >
          {checkbox && <CheckboxCell />}
          {columns.map((col, idx) => (
            <div
              key={col.key}
              style={{
                padding: '0 9px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: justify(col.align),
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.03em',
                textTransform: 'uppercase',
                color: colors.fg3,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                minWidth: 0,
                ...(idx > 0 ? { borderLeft: `1px solid ${colors.border1}` } : null),
                ...(col.sticky
                  ? {
                      position: 'sticky',
                      right: 0,
                      background: colors.bg2,
                      zIndex: 2,
                      boxShadow: '-8px 0 8px -6px rgba(0,0,0,0.5)',
                    }
                  : null),
              }}
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Body rows */}
        {filtered.map((row, i) => {
          const bg = i % 2 ? '#262626' : colors.bg1
          const clickable = Boolean(onRowClick)
          return (
            <div
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                minWidth,
                height: rowHeight,
                borderBottom: `1px solid ${colors.border1}`,
                background: bg,
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              {checkbox && <CheckboxCell />}
              {columns.map((col, idx) => (
                <div
                  key={col.key}
                  style={{
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: justify(col.align),
                    fontSize: 13,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                    color: colors.fg1,
                    ...(idx > 0 ? { borderLeft: `1px solid ${colors.border1}` } : null),
                    ...(col.sticky
                      ? {
                          position: 'sticky',
                          right: 0,
                          background: bg,
                          zIndex: 1,
                          boxShadow: '-8px 0 8px -6px rgba(0,0,0,0.5)',
                          justifyContent: 'flex-end',
                        }
                      : null),
                  }}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '')}
                </div>
              ))}
            </div>
          )
        })}

        {/* TODO(mockup): expandable company rows */}
      </div>

      {/* ── Footer ── */}
      {footer && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 26,
            padding: '8px 16px',
            borderTop: `1px solid ${colors.border1}`,
            fontSize: 12,
            color: colors.fg2,
          }}
        >
          <span>Rows per page: 10 ▾</span>
          <span>{total ? `1–${total} of ${total}` : '0 of 0'}</span>
          <span style={{ display: 'flex', gap: 14, color: colors.bg4 }}>‹ ›</span>
        </div>
      )}
    </div>
  )
}
