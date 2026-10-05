-- Android-push (FCM) delar tabell med iOS (APNs): samma rad per enhet, samma RLS-lås,
-- och kontoradering (delete_user_account) täcker den redan. `platform` skiljer dem åt.
-- Tabellnamnet står kvar — det används av iOS-appen i drift och av radering.
alter table public.apns_subscriptions
  add column if not exists platform text not null default 'ios'
    check (platform in ('ios', 'android'));

create index if not exists apns_subscriptions_platform_idx
  on public.apns_subscriptions (platform, sport, is_active);

comment on column public.apns_subscriptions.platform is
  'ios = APNs device token (64 hex). android = FCM registration token. Avsändaren i nano-os måste filtrera på platform.';
