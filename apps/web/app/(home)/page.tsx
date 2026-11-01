import { headers } from 'next/headers';
import Image from 'next/image';
import logo from '@scoresquid/ui/brand/scoresquid-mark.svg';
import { hostnameOf, sportHref, type Sport } from '@/lib/sport';

const CHOICES: { sport: Sport; label: string }[] = [
  { sport: 'gymnastics', label: 'Gymnastics' },
  { sport: 'archery', label: 'Archery' },
];

export default async function Home() {
  const hostname = hostnameOf((await headers()).get('host'));

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <Image src={logo} alt="" width={96} height={155} priority />
      <div>
        <h1 className="text-4xl font-bold tracking-tight">ScoreSquid</h1>
        <p className="mt-2 text-muted-foreground">Choose your sport</p>
      </div>
      <nav className="flex w-full max-w-sm flex-col gap-3">
        {CHOICES.map(({ sport, label }) => (
          // A plain link: each sport has its own root layout, and may be on another host.
          <a
            key={sport}
            href={sportHref(sport, hostname)}
            className="rounded-md border bg-card px-6 py-4 text-lg font-semibold shadow-sm transition-colors hover:bg-accent"
          >
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
