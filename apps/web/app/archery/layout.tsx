import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@scoresquid/ui/components/sonner';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ThemeProvider } from '@/features/archery/components/theme-provider';
import { getUserSettings } from '@/app/archery/actions/settings';
import { ThemeSync } from '@/features/archery/components/theme-sync';
import { arrowColorMode, arrowPaletteCss } from '@/features/archery/lib/arrow-colors';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'ScoreSquid Archery',
  description: 'Every scorecard, every end, every arrow.',
  icons: { icon: '/icon.svg' },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getUserSettings();
  // Arrow chip colors for the user's setting, plus scoped sets for the settings preview.
  // Built from constants only, never from user input.
  const arrowCss =
    arrowPaletteCss(arrowColorMode(settings.detailed_arrow_colors)) +
    arrowPaletteCss('standard', '[data-arrow-preview="standard"]') +
    arrowPaletteCss('detailed', '[data-arrow-preview="detailed"]');

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <style dangerouslySetInnerHTML={{ __html: arrowCss }} />
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
