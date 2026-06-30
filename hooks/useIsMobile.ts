'use client'

import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'

// Single source of truth for "is this a phone-sized viewport" (< sm = 600px).
// Drives fullScreen dialogs, stacked-card tables, default card views, and spacing.
export function useIsMobile(): boolean {
  return useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
}
