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
import CloseIcon from '@mui/icons-material/Close'

export type FieldType = 'text' | 'password' | 'select' | 'switch'

export type FieldDef = {
  name: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  helperText?: string
}

export type FormValues = Record<string, string | boolean>

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

  const set = (name: string, v: string | boolean) => setValues((prev) => ({ ...prev, [name]: v }))

  function submit() {
    for (const f of fields) {
      if (f.required && f.type !== 'switch') {
        const val = values[f.name]
        if (typeof val !== 'string' || val.trim() === '') {
          setError(`${f.label} is required.`)
          return
        }
      }
    }
    setError('')
    onSubmit(values)
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
