'use client'
import { createTheme, type Theme } from '@mui/material/styles'
import { colors, fontFamily, radius, semantic } from '@/lib/tokens'

const flatSurface = {
  backgroundImage: 'none',
  backgroundColor: colors.bg1,
  border: `1px solid ${colors.border1}`,
  boxShadow: 'none',
}

export function buildTheme(_mode: 'dark' | 'light'): Theme {
  return createTheme({
    palette: {
      mode: 'dark',
      background: {
        default: semantic.bg,
        paper: semantic.surface,
      },
      primary: {
        main: colors.green,
        dark: colors.greenDeep,
        light: colors.greenBright,
        contrastText: colors.greenInk,
      },
      secondary: {
        main: colors.bg4,
        contrastText: colors.fg1,
      },
      success: {
        main: colors.positive,
        light: colors.greenBright,
        dark: colors.greenDeep,
        contrastText: colors.greenInk,
      },
      warning: {
        main: colors.warning,
        contrastText: colors.fg1,
      },
      error: {
        main: colors.negative,
        contrastText: colors.fg1,
      },
      info: {
        main: colors.info,
        contrastText: colors.greenInk,
      },
      text: {
        primary: semantic.text,
        secondary: semantic.textMuted,
        disabled: semantic.textDisabled,
      },
      divider: colors.border1,
    },
    typography: {
      fontFamily: fontFamily.body,
      fontSize: 15,
      body1: { fontSize: 15, lineHeight: 1.5 },
      body2: { fontSize: 13, lineHeight: 1.5 },
      caption: { fontSize: 11, fontWeight: 500, letterSpacing: '0.04em' },
      h6: { fontSize: 18, fontWeight: 600, lineHeight: 1.2 },
    },
    shape: { borderRadius: radius.sm },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: semantic.bg,
            color: semantic.text,
          },
        },
      },
      MuiPaper: {
        styleOverrides: { root: flatSurface },
      },
      MuiCard: {
        styleOverrides: { root: flatSurface },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: radius.sm,
            '&.MuiButton-containedPrimary': {
              backgroundColor: semantic.accent,
              color: colors.greenInk,
              border: `1px solid ${semantic.accentDeep}`,
              '&:hover': { backgroundColor: semantic.accentBright },
            },
            '&.MuiButton-containedSecondary': {
              backgroundColor: colors.bg4,
              color: colors.fg1,
              border: '1px solid #6E6E6E',
            },
            '&.MuiButton-outlined': {
              borderColor: colors.border2,
              color: semantic.text,
              '&:hover': { borderColor: semantic.accent, backgroundColor: 'rgba(55,166,96,0.08)' },
            },
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&:focus-visible': {
              outline: `2px solid ${semantic.accentBright}`,
              outlineOffset: '2px',
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
            '&:hover': { backgroundColor: colors.bg3 },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: colors.bg2,
              borderRadius: radius.sm,
              '& fieldset': { borderColor: colors.border2 },
              '&:hover fieldset': { borderColor: colors.border3 },
              '&.Mui-focused fieldset': { borderColor: semantic.accent },
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: colors.bg2,
            borderRadius: radius.sm,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            ...flatSurface,
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            ...flatSurface,
            borderRight: `1px solid ${colors.border1}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
            '&.Mui-selected': {
              backgroundColor: 'rgba(55,166,96,0.12)',
              color: semantic.accentBright,
              '&:hover': { backgroundColor: 'rgba(55,166,96,0.18)' },
            },
            '&:hover': { backgroundColor: colors.bg3 },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 700,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            color: semantic.textMuted,
            backgroundColor: colors.bg2,
            borderBottom: `1px solid ${colors.border1}`,
          },
          body: {
            borderBottom: `1px solid ${colors.border1}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: radius.sm },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: flatSurface,
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: colors.border1 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderColor: colors.border2,
            color: semantic.textMuted,
            '&.Mui-selected': {
              backgroundColor: 'rgba(55,166,96,0.15)',
              color: semantic.accentBright,
              borderColor: semantic.accent,
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: radius.sm },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
          },
        },
      },
    },
  })
}
