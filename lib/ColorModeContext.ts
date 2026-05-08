import { createContext, useContext } from 'react'

interface ColorModeCtx {
  mode: 'dark' | 'light'
  toggle: (m: 'dark' | 'light') => void
}

export const ColorModeContext = createContext<ColorModeCtx>({
  mode: 'dark',
  toggle: () => {},
})

export const useColorMode = () => useContext(ColorModeContext)
