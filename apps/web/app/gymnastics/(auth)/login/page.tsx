import { LoginScreen } from '@scoresquid/auth/components/login-screen';
import { loginErrorMessage } from '@scoresquid/auth/login-errors';
import { login, signup, resetPassword } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;

  return (
    <LoginScreen
      appName="ScoreSquid Gymnastics"
      tagline="Sign in to track your scores"
      actions={{ login, signup, resetPassword }}
      initialError={loginErrorMessage(error)}
    />
  );
}
