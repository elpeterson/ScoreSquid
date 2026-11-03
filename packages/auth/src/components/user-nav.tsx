'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@scoresquid/ui/components/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@scoresquid/ui/components/avatar';
import { Button } from '@scoresquid/ui/components/button';
import { User, LogOut, Moon, Sun, Laptop, Coffee, Info } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useSignOut } from './use-sign-out';

export function UserNav({
  email,
  updateSetting,
  supportUrl,
  aboutHref,
}: {
  email: string | undefined;
  /** The app's settings action; saves the theme to its settings table. */
  updateSetting: (key: 'theme', value: string) => Promise<unknown>;
  /** Where people can choose to support the app, opened in a new tab. Omit to hide it. */
  supportUrl?: string;
  /** The app's About page. Omit to hide it. */
  aboutHref?: string;
}) {
  const signOut = useSignOut();
  const { setTheme } = useTheme();

  const initials = email?.substring(0, 2).toUpperCase() || 'U';

  const handleThemeChange = async (theme: string) => {
    setTheme(theme);
    await updateSetting('theme', theme);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full" aria-label="Account menu">
          <Avatar className="h-8 w-8">
            <AvatarImage src="" alt={email} />
            <AvatarFallback className="bg-white/15 text-white ring-1 ring-inset ring-white/40">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">Account</p>
            <p className="text-xs leading-none text-muted-foreground">
              {email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/account" className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleThemeChange('light')}>
                  <Sun className="mr-2 h-4 w-4" />
                  <span>Light</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('dark')}>
                  <Moon className="mr-2 h-4 w-4" />
                  <span>Dark</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('system')}>
                  <Laptop className="mr-2 h-4 w-4" />
                  <span>System</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          {aboutHref && (
            <DropdownMenuItem asChild>
              <Link href={aboutHref} className="cursor-pointer">
                <Info className="mr-2 h-4 w-4" />
                <span>About</span>
              </Link>
            </DropdownMenuItem>
          )}

          {supportUrl && (
            <DropdownMenuItem asChild>
              <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                <Coffee className="mr-2 h-4 w-4" />
                <span className="flex flex-col">
                  <span>Support ScoreSquid</span>
                  <span className="text-xs text-muted-foreground">Optional, on Ko-fi</span>
                </span>
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="text-red-600 focus:text-red-600 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
