import { createClient } from '@scoresquid/auth/server';
import { PasswordForm } from '@scoresquid/auth/components/password-form';
import { updatePassword } from './actions';
import { ArcherList } from '@/features/archery/components/archer-list';
import { ArrowColorsSetting } from '@/features/archery/components/arrow-colors-setting';
import { getUserSettings, updateSetting } from '@/app/archery/actions/settings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@scoresquid/ui/components/tabs';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const settings = await getUserSettings();

  const { data: archers } = await supabase
    .from('archer_athletes')
    .select('id, name, membership_number, competition_start_date')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: true });

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h2 className="text-3xl font-bold tracking-tight mb-6">
        Account Settings
      </h2>

      <Tabs
        defaultValue={tab === 'security' || tab === 'display' ? tab : 'archers'}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="archers">Archers</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="archers" className="space-y-4">
          <ArcherList archers={archers ?? []} />
        </TabsContent>

        <TabsContent value="display" className="space-y-4">
          <ArrowColorsSetting
            detailed={settings.detailed_arrow_colors}
            updateSetting={updateSetting}
          />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <PasswordForm action={updatePassword} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
