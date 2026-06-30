'use client'

import Dialog, { type DialogProps } from '@mui/material/Dialog'
import { useIsMobile } from '@/hooks/useIsMobile'

// Drop-in replacement for MUI <Dialog> that goes fullScreen on phones so modal
// content + actions are always reachable. Callers can still override `fullScreen`.
export default function ResponsiveDialog(props: DialogProps) {
  const isMobile = useIsMobile()
  return <Dialog fullScreen={isMobile} {...props} />
}
