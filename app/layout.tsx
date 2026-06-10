import type { Metadata } from 'next'
import { Michroma } from 'next/font/google'
import Providers from '@/components/Providers'
import './globals.css'

const michroma = Michroma({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'Agent AVM Interface',
  description: 'Outbound IVR campaign management for South Africa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={michroma.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
