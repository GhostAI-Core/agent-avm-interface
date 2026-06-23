'use client'

import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EntityFormDrawer, { type FieldDef, type FormValues } from '@/components/telephony/EntityFormDrawer'

export type Column<T> = {
  key: string
  label: string
  render?: (row: T) => ReactNode
}

export type CrudSectionProps<T> = {
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

export default function CrudSection<T>({
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

      <TableContainer>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              {columns.map((c) => <TableCell key={c.key}>{c.label}</TableCell>)}
              <TableCell align="center">Enabled</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => {
              const key = rowKey(row)
              const record = row as Record<string, unknown>
              const enabled = Boolean(record.enabled)
              return (
                <TableRow key={key} hover>
                  {columns.map((c) => (
                    <TableCell key={c.key} sx={{ fontSize: '0.82rem' }}>
                      {c.render ? c.render(row) : String(record[c.key] ?? '—')}
                    </TableCell>
                  ))}
                  <TableCell align="center">
                    <Switch size="small" checked={enabled} onChange={() => onToggle(key)} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label={`Edit ${entityLabel}`} onClick={() => openEdit(row)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Delete ${entityLabel}`} onClick={() => handleDelete(row)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 2}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                    No {entityLabel.toLowerCase()}s yet. Use “Add {entityLabel.toLowerCase()}” to create one.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
