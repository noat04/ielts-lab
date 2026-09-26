begin;

alter table public.profiles enable row level security;
alter table public.study_goals enable row level security;
alter table public.bugs enable row level security;
alter table public.study_sessions enable row level security;
alter table public.weekly_progress enable row level security;
alter table public.test_results enable row level security;
alter table public.practice_exercises enable row level security;
alter table public.exercise_progress enable row level security;
alter table public.theory_notes enable row level security;
alter table public.learning_resources enable row level security;
alter table public.data_imports enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.study_goals from anon, authenticated;
revoke all on table public.bugs from anon, authenticated;
revoke all on table public.study_sessions from anon, authenticated;
revoke all on table public.weekly_progress from anon, authenticated;
revoke all on table public.test_results from anon, authenticated;
revoke all on table public.practice_exercises from anon, authenticated;
revoke all on table public.exercise_progress from anon, authenticated;
revoke all on table public.theory_notes from anon, authenticated;
revoke all on table public.learning_resources from anon, authenticated;
revoke all on table public.data_imports from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.study_goals to authenticated;
grant select, insert, update, delete on table public.bugs to authenticated;
grant select, insert, update, delete on table public.study_sessions to authenticated;
grant select, insert, update, delete on table public.weekly_progress to authenticated;
grant select, insert, update, delete on table public.test_results to authenticated;
grant select, insert, update, delete on table public.practice_exercises to authenticated;
grant select, insert, update, delete on table public.exercise_progress to authenticated;
grant select, insert, update, delete on table public.theory_notes to authenticated;
grant select, insert, update, delete on table public.learning_resources to authenticated;
grant select, insert, update, delete on table public.data_imports to authenticated;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "study_goals_select_own"
on public.study_goals for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "study_goals_insert_own"
on public.study_goals for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "study_goals_update_own"
on public.study_goals for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "bugs_select_own"
on public.bugs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "bugs_insert_own"
on public.bugs for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "bugs_update_own"
on public.bugs for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "bugs_delete_own"
on public.bugs for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "study_sessions_select_own"
on public.study_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "study_sessions_insert_own"
on public.study_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "study_sessions_update_own"
on public.study_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "study_sessions_delete_own"
on public.study_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "weekly_progress_select_own"
on public.weekly_progress for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "weekly_progress_insert_own"
on public.weekly_progress for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "weekly_progress_update_own"
on public.weekly_progress for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "weekly_progress_delete_own"
on public.weekly_progress for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "test_results_select_own"
on public.test_results for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "test_results_insert_own"
on public.test_results for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "test_results_update_own"
on public.test_results for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "test_results_delete_own"
on public.test_results for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "practice_exercises_select_own"
on public.practice_exercises for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "practice_exercises_insert_own"
on public.practice_exercises for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "practice_exercises_update_own"
on public.practice_exercises for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "practice_exercises_delete_own"
on public.practice_exercises for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "exercise_progress_select_own"
on public.exercise_progress for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "exercise_progress_insert_own"
on public.exercise_progress for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "exercise_progress_update_own"
on public.exercise_progress for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "exercise_progress_delete_own"
on public.exercise_progress for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "theory_notes_select_own"
on public.theory_notes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "theory_notes_insert_own"
on public.theory_notes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "theory_notes_update_own"
on public.theory_notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "theory_notes_delete_own"
on public.theory_notes for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "learning_resources_select_own"
on public.learning_resources for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "learning_resources_insert_own"
on public.learning_resources for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "learning_resources_update_own"
on public.learning_resources for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "learning_resources_delete_own"
on public.learning_resources for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "data_imports_select_own"
on public.data_imports for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "data_imports_insert_own"
on public.data_imports for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "data_imports_update_own"
on public.data_imports for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "data_imports_delete_own"
on public.data_imports for delete
to authenticated
using ((select auth.uid()) = user_id);

commit;
