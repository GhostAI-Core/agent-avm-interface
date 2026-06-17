'use client'

import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'

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

export default function EntityFormDialog({
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
  // The parent remounts this dialog (via `key`) each time it opens, so the
  // initializer below always reflects the entity being created/edited.
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
