begin;

alter table public.study_reminder_settings
  add column if not exists push_notifications boolean not null default false,
  add column if not exists email_notifications boolean not null default false;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint),
  constraint push_subscription_values_not_blank check (
    char_length(btrim(endpoint)) > 10 and char_length(btrim(p256dh)) > 10 and char_length(btrim(auth_key)) > 5
  )
);

create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_id uuid not null references public.study_reminders (id) on delete cascade,
  channel text not null,
  status text not null default 'PENDING',
  provider_message text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_delivery_channel_valid check (channel in ('PUSH', 'EMAIL')),
  constraint reminder_delivery_status_valid check (status in ('PENDING', 'SENT', 'FAILED')),
  unique (reminder_id, channel)
);

create index push_subscriptions_user_active_idx on public.push_subscriptions (user_id, active);
create index reminder_deliveries_user_status_idx on public.reminder_deliveries (user_id, status, created_at desc);

create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
for each row execute function public.ielts_lab_set_updated_at();
create trigger reminder_deliveries_set_updated_at before update on public.reminder_deliveries
for each row execute function public.ielts_lab_set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.reminder_deliveries enable row level security;

create policy "push_subscriptions_own_all" on public.push_subscriptions for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reminder_deliveries_own_select" on public.reminder_deliveries for select to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select on table public.reminder_deliveries to authenticated;

commit;
