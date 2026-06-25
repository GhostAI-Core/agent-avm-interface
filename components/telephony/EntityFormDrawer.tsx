'use client'

import { useState } from 'react'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import CloseIcon from '@mui/icons-material/Close'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'

// 'chips' is a freeSolo Autocomplete: press Enter to add a value, click ✕ to remove,
// drag a chip to reorder. Its value is a string[] (not a string), so FormValues widens
// to include string[] for these fields only.
export type FieldType = 'text' | 'password' | 'select' | 'switch' | 'chips'

export type FieldDef = {
  name: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  helperText?: string
}

export type FormValues = Record<string, string | boolean | string[]>

/**
 * Right-anchored Drawer holding an entity create/edit form. Drop-in replacement for the old
 * centred EntityFormDialog — same props — so every telephony CRUD table opens its form on the
 * right instead of over the page. The parent remounts via `key` on each open, so the initializer
 * always reflects the entity being created/edited.
 */
export default function EntityFormDrawer({
  open,
  title,
  fields,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  fields: FieldDef[]
  initial: FormValues
  onClose: () => void
  onSubmit: (values: FormValues) => void
}) {
  const [values, setValues] = useState<FormValues>(initial)
  const [error, setError] = useState('')
  // Index of the chip currently being dragged (per most-recent dragstart), keyed by field name.
  const [dragField, setDragField] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const set = (name: string, v: string | boolean | string[]) =>
    setValues((prev) => ({ ...prev, [name]: v }))

  function submit() {
    for (const f of fields) {
      if (!f.required) continue
      if (f.type === 'switch') continue
      const val = values[f.name]
      if (f.type === 'chips') {
        if (!Array.isArray(val) || val.length === 0) {
          setError(`${f.label} is required.`)
          return
        }
        continue
      }
      if (typeof val !== 'string' || val.trim() === '') {
        setError(`${f.label} is required.`)
        return
      }
    }
    setError('')
    onSubmit(values)
  }

  // Reorder a chips field's value, moving item `from` to index `to`.
  function reorder(name: string, from: number, to: number) {
    setValues((prev) => {
      const current = prev[name]
      if (!Array.isArray(current)) return prev
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return prev
      const next = current.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { ...prev, [name]: next }
    })
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100vw', sm: 420 }, maxWidth: '100vw' } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
          <IconButton aria-label="Close" onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Divider />

        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3 }}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {fields.map((f) => {
              if (f.type === 'chips') {
                const chips = Array.isArray(values[f.name]) ? (values[f.name] as string[]) : []
                return (
                  <Autocomplete<string, true, false, true>
                    key={f.name}
                    multiple
                    freeSolo
                    options={[] as string[]}
                    value={chips}
                    onChange={(_, next) => {
                      // Dedupe + trim on add; Autocomplete owns add/remove, drag owns order.
                      const cleaned: string[] = []
                      for (const raw of next) {
                        const v = String(raw).trim()
                        if (v && !cleaned.includes(v)) cleaned.push(v)
                      }
                      set(f.name, cleaned)
                    }}
                    renderValue={(value, getItemProps) =>
                      value.map((option, index) => {
                        const { key, ...itemProps } = getItemProps({ index })
                        return (
                          <Chip
                            {...itemProps}
                            key={key}
                            label={option}
                            size="small"
                            icon={<DragIndicatorIcon fontSize="small" sx={{ cursor: 'grab' }} />}
                            draggable
                            onDragStart={() => { setDragField(f.name); setDragIndex(index) }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (dragField === f.name && dragIndex !== null) reorder(f.name, dragIndex, index)
                              setDragField(null); setDragIndex(null)
                            }}
                            onDragEnd={() => { setDragField(null); setDragIndex(null) }}
                            sx={{ '& .MuiChip-icon': { ml: 0.5, mr: -0.25 } }}
                          />
                        )
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={f.label}
                        size="small"
                        required={f.required}
                        placeholder={f.placeholder}
                        helperText={f.helperText}
                      />
                    )}
                  />
                )
              }
              if (f.type === 'switch') {
                return (
                  <FormControlLabel
                    key={f.name}
                    control={
                      <Switch
                        checked={Boolean(values[f.name])}
                        onChange={(e) => set(f.name, e.target.checked)}
                      />
                    }
                    label={f.label}
                  />
                )
              }
              const common = {
                label: f.label,
                size: 'small' as const,
                fullWidth: true,
                required: f.required,
                placeholder: f.placeholder,
                helperText: f.helperText,
                value: typeof values[f.name] === 'string' ? (values[f.name] as string) : '',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(f.name, e.target.value),
              }
              if (f.type === 'select') {
                return (
                  <TextField key={f.name} {...common} select>
                    {(f.options ?? []).map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                )
              }
              return <TextField key={f.name} {...common} type={f.type === 'password' ? 'password' : 'text'} />
            })}
          </Stack>
        </Box>

        <Divider />
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit}>Save</Button>
        </Stack>
      </Box>
    </Drawer>
  )
}
