import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@scoresquid/ui/components/sonner';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ThemeProvider } from '@/features/gymnastics/components/theme-provider';
import { getUserSettings } from '@/app/gymnastics/actions/settings';
import { ThemeSync } from '@/features/gymnastics/components/theme-sync';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'ScoreSquid Gymnastics',
  description: 'Track your gymnastics scores',
  icons: { icon: '/icon.svg' },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getUserSettings();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeSync serverTheme={settings.theme} />

          <main className="min-h-screen bg-background text-foreground">
            {children}
          </main>

          {/* At the top, so on a phone notifications don't cover the controls being used. */}
          <Toaster position="top-center" />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
