'use client'

import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import EntityFormDrawer, { type FieldDef, type FormValues } from '@/components/telephony/EntityFormDrawer'
import { colors } from '@/lib/tokens'

type RowModel = Record<string, unknown>

export type Column<T> = {
  key: string
  label: string
  render?: (row: T) => ReactNode
}

export type CrudSectionProps<T extends RowModel> = {
  title: string
  description?: string
  entityLabel: string // singular, e.g. "Provider" — used in Add/Edit titles
  items: T[]
  columns: Column<T>[]
  fields: FieldDef[]
  rowKey: (row: T) => string
  toFormValues: (row: T) => FormValues
  emptyForm: FormValues
  onCreate: (values: FormValues) => void
  onUpdate: (key: string, values: FormValues) => void
  onDelete: (key: string) => void
  onToggle: (key: string) => void
}

export default function CrudSection<T extends RowModel>({
  title,
  description,
  entityLabel,
  items,
  columns,
  fields,
  rowKey,
  toFormValues,
  emptyForm,
  onCreate,
  onUpdate,
  onDelete,
  onToggle,
}: CrudSectionProps<T>) {
  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [initial, setInitial] = useState<FormValues>(emptyForm)
  // Bumped on every open so the dialog remounts with fresh form state.
  const [seq, setSeq] = useState(0)

  function openCreate() {
    setEditingKey(null)
    setInitial({ ...emptyForm })
    setSeq((s) => s + 1)
    setOpen(true)
  }
  function openEdit(row: T) {
    setEditingKey(rowKey(row))
    setInitial(toFormValues(row))
    setSeq((s) => s + 1)
    setOpen(true)
  }
  function handleSubmit(values: FormValues) {
    if (editingKey) onUpdate(editingKey, values)
    else onCreate(values)
    setOpen(false)
  }
  function handleDelete(row: T) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete this ${entityLabel.toLowerCase()}?`)) return
    onDelete(rowKey(row))
  }

  // Map the per-panel column config to DataTableColumn, then append the Enabled
  // toggle and a sticky Actions column. Both interactive cells stopPropagation so
  // they never bubble to a row click.
  const gridColumns: DataTableColumn<T>[] = [
    ...columns.map<DataTableColumn<T>>((c) => ({
      key: c.key,
      label: c.label,
      width: '1fr',
      render: (row) =>
        c.render ? (
          <Box sx={{ fontSize: '0.82rem' }}>{c.render(row)}</Box>
        ) : (
          <Box sx={{ fontSize: '0.82rem' }}>
            {String((row as Record<string, unknown>)[c.key] ?? '—')}
          </Box>
        ),
    })),
    {
      key: '__enabled',
      label: 'Enabled',
      align: 'center',
      width: '110px',
      render: (row) => (
        <Box onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checked={Boolean((row as Record<string, unknown>).enabled)}
            onChange={() => onToggle(rowKey(row))}
            slotProps={{ input: { 'aria-label': `Toggle ${entityLabel}` } }}
          />
        </Box>
      ),
    },
    {
      key: '__actions',
      label: 'Actions',
      align: 'right',
      width: '120px',
      sticky: true,
      render: (row) => (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          <IconButton size="small" aria-label={`Edit ${entityLabel}`} onClick={() => openEdit(row)}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label={`Delete ${entityLabel}`} onClick={() => handleDelete(row)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ]

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{title}</Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">{description}</Typography>
          )}
        </Box>
        {/* Mockup-styled "+ Add" pill — green fill, ink text, deep-green border. */}
        <Box
          component="button"
          type="button"
          onClick={openCreate}
          sx={{
            background: colors.green,
            color: colors.greenInk,
            border: `1px solid ${colors.greenDeep}`,
            borderRadius: '4px',
            px: 1.75,
            py: 1,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'filter .15s ease',
            '&:hover': { filter: 'brightness(1.08)' },
          }}
        >
          + Add {entityLabel.toLowerCase()}
        </Box>
      </Stack>

      <DataTable<T>
        rows={items}
        columns={gridColumns}
        getRowId={(row) => rowKey(row)}
        checkbox
      />

      <EntityFormDrawer
        key={seq}
        open={open}
        title={editingKey ? `Edit ${entityLabel.toLowerCase()}` : `Add ${entityLabel.toLowerCase()}`}
        fields={fields}
        initial={initial}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
      />
    </Box>
  )
}
