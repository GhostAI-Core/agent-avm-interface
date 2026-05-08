'use client'
import { createTheme, type Theme } from '@mui/material/styles'

export function buildTheme(mode: 'dark' | 'light'): Theme {
  const isDark = mode === 'dark'
  return createTheme({
    palette: {
      mode,
      background: {
        default: isDark ? '#0f172a' : '#f1f5f9',
        paper:   'rgba(30,41,59,0.75)',
      },
      primary:   { main: '#3b82f6' },
      success:   { main: '#10b981' },
      warning:   { main: '#f59e0b' },
      error:     { main: '#ef4444' },
      text: {
        primary:   '#f8fafc',
        secondary: '#94a3b8',
      },
    },
    typography: { fontFamily: "'Inter', sans-serif" },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          },
        },
      },
      MuiButton: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&:focus-visible': { outline: '2px solid #3b82f6', outlineOffset: '2px' },
          },
        },
      },
    },
  })
}
