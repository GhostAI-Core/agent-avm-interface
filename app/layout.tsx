import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agent AVM Interface',
  description: 'Outbound IVR campaign management for South Africa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}
