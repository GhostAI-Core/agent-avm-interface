'use client'
import { useState, useMemo } from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { buildTheme } from '@/lib/theme'
import { ColorModeContext } from '@/lib/ColorModeContext'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'dark' | 'light'>('dark')
  const theme = useMemo(() => buildTheme(mode), [mode])

  return (
    <ColorModeContext.Provider value={{ mode, toggle: setMode }}>
      <AppRouterCacheProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </AppRouterCacheProvider>
    </ColorModeContext.Provider>
  )
}
