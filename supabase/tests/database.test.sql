begin;

select plan(16);

select has_table('public', 'week_sprints', 'week_sprints exists');
select has_table('public', 'learning_source_mappings', 'source mappings exist');
select has_table('public', 'study_tasks', 'study tasks exist');
select has_table('public', 'study_reminder_settings', 'reminder settings exist');
select has_table('public', 'push_subscriptions', 'push subscriptions exist');
select has_table('public', 'reminder_deliveries', 'reminder deliveries exist');
select has_function('public', 'ielts_lab_import_week_sprint', array['uuid', 'date', 'text', 'text', 'jsonb', 'jsonb'], 'sprint import RPC exists');
select has_function('public', 'ielts_lab_delete_week_sprint', array['uuid'], 'sprint delete RPC exists');
select has_function('public', 'ielts_lab_update_week_sprint', array['uuid', 'date', 'text', 'text', 'jsonb'], 'sprint update RPC exists');
select has_function('public', 'ielts_lab_refresh_study_reminders', array[]::text[], 'reminder refresh RPC exists');
select col_is_not_null('public', 'study_reminder_settings', 'push_notifications', 'push setting is required');
select col_is_not_null('public', 'study_reminder_settings', 'email_notifications', 'email setting is required');
select is((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass), true, 'push subscriptions use RLS');
select is((select relrowsecurity from pg_class where oid = 'public.reminder_deliveries'::regclass), true, 'reminder deliveries use RLS');
select has_index('public', 'push_subscriptions', 'push_subscriptions_user_active_idx', 'push lookup index exists');
select has_index('public', 'reminder_deliveries', 'reminder_deliveries_user_status_idx', 'delivery lookup index exists');

select * from finish();
rollback;
