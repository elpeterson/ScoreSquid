'use client';

import { useTransition } from 'react';
import { Button } from '@scoresquid/ui/components/button';
import { Input } from '@scoresquid/ui/components/input';
import { Label } from '@scoresquid/ui/components/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@scoresquid/ui/components/card';
import { toast } from 'sonner';
import type { ActionResult } from '../actions';

export function PasswordForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      const result = await action(formData);

      if (result?.error) {
        toast.error('Error', { description: result.error });
      } else {
        toast.success('Password Updated', {
          description: 'You can now use this password to log in.',
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Set a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
