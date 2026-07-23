import type { Metadata } from 'next'
import { Michroma, DM_Sans, JetBrains_Mono } from 'next/font/google'
import Providers from '@/components/Providers'
import './globals.css'

const michroma = Michroma({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
})

// The reference UI is DM Sans for text + JetBrains Mono for figures. These were named in the
// CSS stacks but never loaded, so we fell back to system fonts — load them for real here.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
})
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'Agent AVM Interface',
  description: 'Outbound IVR campaign management for South Africa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${michroma.variable} ${dmSans.variable} ${jetBrainsMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
