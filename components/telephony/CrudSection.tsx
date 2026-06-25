'use client'

import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import type { GridColDef, GridValidRowModel } from '@mui/x-data-grid'
import DataTable from '@/components/ui/DataTable'
import EntityFormDrawer, { type FieldDef, type FormValues } from '@/components/telephony/EntityFormDrawer'

export type Column<T> = {
  key: string
  label: string
  render?: (row: T) => ReactNode
}

export type CrudSectionProps<T extends GridValidRowModel> = {
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

export default function CrudSection<T extends GridValidRowModel>({
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

  // Map the per-panel column config to GridColDef, then append the Enabled toggle
  // and Actions columns. Both interactive cells stopPropagation so they never bubble
  // to a row click / selection.
  const gridColumns: GridColDef<T>[] = [
    ...columns.map<GridColDef<T>>((c) => ({
      field: c.key,
      headerName: c.label,
      flex: 1,
      minWidth: 120,
      sortable: true,
      renderCell: (params) =>
        c.render ? (
          <Box sx={{ fontSize: '0.82rem' }}>{c.render(params.row)}</Box>
        ) : (
          <Box sx={{ fontSize: '0.82rem' }}>
            {String((params.row as Record<string, unknown>)[c.key] ?? '—')}
          </Box>
        ),
    })),
    {
      field: '__enabled',
      headerName: 'Enabled',
      width: 110,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      filterable: false,
      disableExport: true,
      valueGetter: (_value, row) => Boolean((row as Record<string, unknown>).enabled),
      renderCell: (params) => (
        <Box onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checked={Boolean((params.row as Record<string, unknown>).enabled)}
            onChange={() => onToggle(rowKey(params.row))}
            slotProps={{ input: { 'aria-label': `Toggle ${entityLabel}` } }}
          />
        </Box>
      ),
    },
    {
      field: '__actions',
      headerName: 'Actions',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      filterable: false,
      disableExport: true,
      renderCell: (params) => (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          <IconButton size="small" aria-label={`Edit ${entityLabel}`} onClick={() => openEdit(params.row)}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label={`Delete ${entityLabel}`} onClick={() => handleDelete(params.row)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ]

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">{description}</Typography>
          )}
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add {entityLabel.toLowerCase()}
        </Button>
      </Stack>

      <DataTable<T>
        rows={items}
        columns={gridColumns}
        getRowId={(row) => rowKey(row)}
        checkboxSelection={false}
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
    </Paper>
  )
}
