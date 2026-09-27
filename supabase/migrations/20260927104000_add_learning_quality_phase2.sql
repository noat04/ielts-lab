begin;

create table public.error_type_catalog (
  code text primary key,
  category text not null,
  label text not null,
  description text not null default '',
  sort_order integer not null default 0,
  constraint error_type_catalog_code_valid check (code ~ '^[A-Z][A-Z_]+$'),
  constraint error_type_catalog_category_valid check (category in ('COMPREHENSION', 'LANGUAGE', 'PRODUCTION', 'PROCESS'))
);

insert into public.error_type_catalog (code, category, label, description, sort_order) values
  ('LOCATING', 'COMPREHENSION', 'Không định vị được thông tin', 'Không tìm đúng đoạn chứa bằng chứng.', 10),
  ('PARAPHRASE', 'COMPREHENSION', 'Không nhận ra paraphrase', 'Không nối được cách diễn đạt trong câu hỏi với tài liệu.', 20),
  ('DISTRACTOR', 'COMPREHENSION', 'Bị nhiễu', 'Chọn phương án gây nhiễu thay vì bằng chứng quyết định.', 30),
  ('ANSWER_BOUNDARY', 'COMPREHENSION', 'Sai phạm vi đáp án', 'Thừa, thiếu từ hoặc vượt giới hạn đáp án.', 40),
  ('TARGET', 'COMPREHENSION', 'Sai mục tiêu câu hỏi', 'Hiểu sai điều câu hỏi đang yêu cầu.', 50),
  ('VOCABULARY', 'LANGUAGE', 'Từ vựng', 'Thiếu nghĩa, sắc thái hoặc collocation.', 60),
  ('GRAMMAR', 'LANGUAGE', 'Ngữ pháp', 'Sai cấu trúc, chia thì hoặc quan hệ ngữ pháp.', 70),
  ('SPELLING', 'LANGUAGE', 'Chính tả', 'Viết sai chính tả hoặc dạng từ.', 80),
  ('TASK_RESPONSE', 'PRODUCTION', 'Task response', 'Bài nói/viết chưa trả lời đủ hoặc đúng trọng tâm.', 90),
  ('COHERENCE', 'PRODUCTION', 'Mạch lạc và liên kết', 'Ý hoặc đoạn chưa được tổ chức rõ ràng.', 100),
  ('PRONUNCIATION', 'PRODUCTION', 'Phát âm', 'Âm, trọng âm hoặc ngữ điệu làm giảm độ rõ.', 110),
  ('TIME', 'PROCESS', 'Quản lý thời gian', 'Phân bổ thời gian chưa phù hợp.', 120),
  ('INSTRUCTION', 'PROCESS', 'Sai yêu cầu đề', 'Bỏ sót hoặc hiểu sai chỉ dẫn.', 130),
  ('OTHER', 'PROCESS', 'Khác', 'Lỗi chưa thuộc nhóm chuẩn ở trên.', 999);

alter table public.error_type_catalog enable row level security;
grant select on table public.error_type_catalog to authenticated;
create policy "error_type_catalog_authenticated_read" on public.error_type_catalog
  for select to authenticated using (true);

alter table public.bugs
  add column lifecycle_status text,
  add column severity text not null default 'MEDIUM',
  add column occurrence_count integer not null default 1,
  add column next_retest_at date,
  add column resolved_at timestamptz,
  add column resolution_note text not null default '',
  add constraint bugs_error_type_catalog_fk foreign key (error_type)
    references public.error_type_catalog (code) not valid,
  add constraint bugs_lifecycle_status_valid check (
    lifecycle_status in ('OPEN', 'FIXING', 'RETEST_DUE', 'RESOLVED', 'REOPENED')
  ),
  add constraint bugs_severity_valid check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  add constraint bugs_occurrence_count_valid check (occurrence_count > 0);

update public.bugs
set lifecycle_status = case when status = 'DONE' then 'RESOLVED' else 'OPEN' end,
    resolved_at = case when status = 'DONE' then coalesce(resolved_at, updated_at) else resolved_at end
where lifecycle_status is null;

alter table public.bugs alter column lifecycle_status set not null;
alter table public.bugs alter column lifecycle_status set default 'OPEN';

create or replace function public.ielts_lab_sync_bug_lifecycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.lifecycle_status is distinct from old.lifecycle_status then
    new.status := case when new.lifecycle_status = 'RESOLVED' then 'DONE' else 'OPEN' end;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.lifecycle_status := case
      when new.status = 'DONE' then 'RESOLVED'
      when old.lifecycle_status = 'RESOLVED' then 'REOPENED'
      else old.lifecycle_status
    end;
  else
    new.status := case when new.lifecycle_status = 'RESOLVED' then 'DONE' else 'OPEN' end;
  end if;
  new.resolved_at := case
    when new.lifecycle_status = 'RESOLVED' then coalesce(new.resolved_at, now())
    else null
  end;
  return new;
end;
$$;

create trigger bugs_sync_lifecycle before insert or update of status, lifecycle_status on public.bugs
for each row execute function public.ielts_lab_sync_bug_lifecycle();

-- Phase 1 installations created before this ownership key was added still need
-- it before bug_retests can reference (user_id, bug_id).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bugs'::regclass
      and conname = 'bugs_user_id_id_unique'
  ) then
    alter table public.bugs
      add constraint bugs_user_id_id_unique unique (user_id, id);
  end if;
end;
$$;

create table public.bug_retests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bug_id uuid not null,
  sprint_id uuid,
  scheduled_for date not null default current_date,
  result text not null default 'PENDING',
  answer text not null default '',
  notes text not null default '',
  tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, bug_id) references public.bugs (user_id, id) on delete cascade,
  foreign key (user_id, sprint_id) references public.week_sprints (user_id, id) on delete set null (sprint_id),
  constraint bug_retests_result_valid check (result in ('PENDING', 'PASS', 'FAIL')),
  constraint bug_retests_tested_at_valid check (result = 'PENDING' or tested_at is not null),
  unique (user_id, id)
);

create table public.sprint_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sprint_id uuid not null,
  planned_sessions integer not null default 0,
  completed_sessions integer not null default 0,
  adherence_percent numeric(5,2),
  planned_minutes integer not null default 0,
  actual_minutes integer not null default 0,
  time_completion_percent numeric(5,2),
  task_accuracy_percent numeric(5,2),
  retest_pass_percent numeric(5,2),
  new_bugs integer not null default 0,
  resolved_bugs integer not null default 0,
  carry_over_count integer not null default 0,
  overall_score numeric(5,2),
  calculated_at timestamptz not null default now(),
  foreign key (user_id, sprint_id) references public.week_sprints (user_id, id) on delete cascade,
  unique (user_id, sprint_id),
  unique (user_id, id)
);

create table public.weekly_retrospectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sprint_id uuid not null,
  energy_score smallint not null default 3,
  confidence_score smallint not null default 3,
  wins text[] not null default '{}',
  challenges text[] not null default '{}',
  stop_doing text not null default '',
  start_doing text not null default '',
  continue_doing text not null default '',
  next_week_focus text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, sprint_id) references public.week_sprints (user_id, id) on delete cascade,
  constraint weekly_retrospective_scores_valid check (energy_score between 1 and 5 and confidence_score between 1 and 5),
  unique (user_id, sprint_id),
  unique (user_id, id)
);

create table public.carry_over_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_sprint_id uuid not null,
  to_sprint_id uuid not null,
  source_lesson_id uuid,
  target_lesson_id uuid,
  reason text not null default 'UNFINISHED',
  status text not null default 'PLANNED',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (user_id, from_sprint_id) references public.week_sprints (user_id, id) on delete cascade,
  foreign key (user_id, to_sprint_id) references public.week_sprints (user_id, id) on delete cascade,
  foreign key (user_id, source_lesson_id) references public.daily_lessons (user_id, id) on delete set null (source_lesson_id),
  foreign key (user_id, target_lesson_id) references public.daily_lessons (user_id, id) on delete set null (target_lesson_id),
  constraint carry_over_reason_valid check (reason in ('UNFINISHED', 'LOW_SCORE', 'RETEST', 'MANUAL')),
  constraint carry_over_status_valid check (status in ('PLANNED', 'COMPLETED', 'CANCELLED')),
  unique (user_id, from_sprint_id, source_lesson_id),
  unique (user_id, id)
);

create index bugs_lifecycle_retest_idx on public.bugs (user_id, lifecycle_status, next_retest_at);
create index bug_retests_due_idx on public.bug_retests (user_id, result, scheduled_for);
create index carry_over_to_sprint_idx on public.carry_over_items (to_sprint_id, status);

create trigger bug_retests_set_updated_at before update on public.bug_retests
for each row execute function public.ielts_lab_set_updated_at();
create trigger weekly_retrospectives_set_updated_at before update on public.weekly_retrospectives
for each row execute function public.ielts_lab_set_updated_at();

alter table public.bug_retests enable row level security;
alter table public.sprint_kpis enable row level security;
alter table public.weekly_retrospectives enable row level security;
alter table public.carry_over_items enable row level security;

grant select, insert, update, delete on table public.bug_retests to authenticated;
grant select, insert, update, delete on table public.sprint_kpis to authenticated;
grant select, insert, update, delete on table public.weekly_retrospectives to authenticated;
grant select, insert, update, delete on table public.carry_over_items to authenticated;

create policy "bug_retests_own_all" on public.bug_retests for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sprint_kpis_own_all" on public.sprint_kpis for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "weekly_retrospectives_own_all" on public.weekly_retrospectives for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "carry_over_items_own_all" on public.carry_over_items for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.ielts_lab_refresh_sprint_kpis(p_sprint_id uuid)
returns public.sprint_kpis
language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.sprint_kpis;
  v_planned integer; v_completed integer; v_planned_minutes integer; v_actual_minutes integer;
  v_attempted integer; v_correct integer; v_retested integer; v_passed integer;
  v_new_bugs integer; v_resolved integer; v_carry integer;
  v_adherence numeric(5,2); v_time numeric(5,2); v_accuracy numeric(5,2); v_retest numeric(5,2); v_overall numeric(5,2);
begin
  if not exists (select 1 from public.week_sprints where id = p_sprint_id and user_id = v_user_id) then
    raise exception 'Sprint not found';
  end if;

  select count(*), count(*) filter (where workflow_status = 'DONE'), coalesce(sum(duration_minutes), 0)
  into v_planned, v_completed, v_planned_minutes
  from public.daily_lessons where week_sprint_id = p_sprint_id and user_id = v_user_id;

  select coalesce(sum(sr.duration_minutes), 0) into v_actual_minutes
  from public.session_results sr join public.daily_lessons dl on dl.id = sr.lesson_id
  where dl.week_sprint_id = p_sprint_id and sr.user_id = v_user_id;

  with latest as (
    select distinct on (a.task_id) a.is_correct
    from public.task_attempts a
    join public.study_tasks t on t.id = a.task_id
    join public.daily_lessons dl on dl.id = t.lesson_id
    where a.user_id = v_user_id and dl.week_sprint_id = p_sprint_id
    order by a.task_id, a.attempt_number desc
  ) select count(*), count(*) filter (where is_correct is true) into v_attempted, v_correct from latest;

  select count(*) filter (where result <> 'PENDING'), count(*) filter (where result = 'PASS')
  into v_retested, v_passed from public.bug_retests where user_id = v_user_id and sprint_id = p_sprint_id;

  select count(*), count(*) filter (where lifecycle_status = 'RESOLVED') into v_new_bugs, v_resolved
  from public.bugs where user_id = v_user_id and daily_lesson_id in (
    select id from public.daily_lessons where week_sprint_id = p_sprint_id and user_id = v_user_id
  );
  select count(*) into v_carry from public.carry_over_items where user_id = v_user_id and to_sprint_id = p_sprint_id;

  v_adherence := case when v_planned > 0 then round(v_completed::numeric * 100 / v_planned, 2) end;
  v_time := case when v_planned_minutes > 0 then least(100, round(v_actual_minutes::numeric * 100 / v_planned_minutes, 2)) end;
  v_accuracy := case when v_attempted > 0 then round(v_correct::numeric * 100 / v_attempted, 2) end;
  v_retest := case when v_retested > 0 then round(v_passed::numeric * 100 / v_retested, 2) end;
  select round(avg(value), 2) into v_overall from unnest(array[v_adherence, v_time, v_accuracy, v_retest]) value where value is not null;

  insert into public.sprint_kpis (user_id, sprint_id, planned_sessions, completed_sessions, adherence_percent,
    planned_minutes, actual_minutes, time_completion_percent, task_accuracy_percent, retest_pass_percent,
    new_bugs, resolved_bugs, carry_over_count, overall_score, calculated_at)
  values (v_user_id, p_sprint_id, v_planned, v_completed, v_adherence, v_planned_minutes, v_actual_minutes,
    v_time, v_accuracy, v_retest, v_new_bugs, v_resolved, v_carry, v_overall, now())
  on conflict (user_id, sprint_id) do update set
    planned_sessions = excluded.planned_sessions, completed_sessions = excluded.completed_sessions,
    adherence_percent = excluded.adherence_percent, planned_minutes = excluded.planned_minutes,
    actual_minutes = excluded.actual_minutes, time_completion_percent = excluded.time_completion_percent,
    task_accuracy_percent = excluded.task_accuracy_percent, retest_pass_percent = excluded.retest_pass_percent,
    new_bugs = excluded.new_bugs, resolved_bugs = excluded.resolved_bugs,
    carry_over_count = excluded.carry_over_count, overall_score = excluded.overall_score,
    calculated_at = excluded.calculated_at
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.ielts_lab_record_bug_retest(p_bug_id uuid, p_sprint_id uuid, p_result text, p_answer text default '', p_notes text default '')
returns public.bug_retests
language plpgsql security invoker set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_retest public.bug_retests;
begin
  if p_result not in ('PASS', 'FAIL') then raise exception 'Invalid retest result'; end if;
  if not exists (select 1 from public.bugs where id = p_bug_id and user_id = v_user_id) then raise exception 'Bug not found'; end if;
  select * into v_retest from public.bug_retests
  where user_id = v_user_id and bug_id = p_bug_id and result = 'PENDING'
  order by scheduled_for, created_at limit 1;
  if v_retest.id is null then
    insert into public.bug_retests (user_id, bug_id, sprint_id, scheduled_for, result, answer, notes, tested_at)
    values (v_user_id, p_bug_id, p_sprint_id, current_date, p_result, coalesce(p_answer,''), coalesce(p_notes,''), now()) returning * into v_retest;
  else
    update public.bug_retests set sprint_id = p_sprint_id, result = p_result, answer = coalesce(p_answer,''), notes = coalesce(p_notes,''), tested_at = now()
    where id = v_retest.id and user_id = v_user_id returning * into v_retest;
  end if;
  update public.bugs set
    lifecycle_status = case when p_result = 'PASS' then 'RESOLVED' else 'REOPENED' end,
    occurrence_count = occurrence_count + case when p_result = 'FAIL' then 1 else 0 end,
    next_retest_at = case when p_result = 'FAIL' then current_date + 3 else null end,
    resolution_note = case when p_result = 'PASS' then coalesce(p_notes,'') else resolution_note end
  where id = p_bug_id and user_id = v_user_id;
  return v_retest;
end;
$$;

create or replace function public.ielts_lab_generate_next_week(
  p_from_sprint_id uuid, p_start_date date, p_title text, p_objective text, p_targets jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_from public.week_sprints;
  v_plan public.learning_plans;
  v_next_id uuid;
  v_week_number integer;
  v_old public.daily_lessons;
  v_new_id uuid;
  v_dates date[];
  v_date date;
  v_index integer := 1;
  v_skill text;
  v_existing integer;
begin
  if p_start_date is null then raise exception 'Start date is required'; end if;
  select * into v_from from public.week_sprints where id = p_from_sprint_id and user_id = v_user_id;
  if v_from.id is null then raise exception 'Sprint not found'; end if;
  select * into v_plan from public.learning_plans where id = v_from.plan_id and user_id = v_user_id;
  select coalesce(max(week_number), 0) + 1 into v_week_number from public.week_sprints where plan_id = v_from.plan_id and user_id = v_user_id;
  select array_agg(p_start_date + gs.day_offset order by gs.day_offset)
  into v_dates
  from generate_series(0, 6) as gs(day_offset)
  where extract(dow from (p_start_date + gs.day_offset))::smallint = any(v_plan.study_days);
  if coalesce(cardinality(v_dates), 0) = 0 then raise exception 'Study days are not configured'; end if;

  insert into public.week_sprints (user_id, plan_id, week_number, start_date, end_date, title, objective, skill_targets, status)
  values (v_user_id, v_from.plan_id, v_week_number, p_start_date, p_start_date + 6, coalesce(nullif(btrim(p_title),''), 'Week ' || v_week_number), coalesce(p_objective,''), coalesce(p_targets,'{}'), 'PLANNED')
  returning id into v_next_id;

  for v_old in select * from public.daily_lessons
    where user_id = v_user_id and week_sprint_id = p_from_sprint_id and workflow_status <> 'DONE'
    order by lesson_date, created_at
  loop
    v_date := v_dates[1 + ((v_index - 1) % cardinality(v_dates))];
    insert into public.daily_lessons (user_id, plan_id, phase_id, week_sprint_id, source_mapping_id, lesson_date,
      title, description, objective, skill, duration_minutes, priority, status, workflow_status, target_score, generation_source, source_key)
    values (v_user_id, v_old.plan_id, v_old.phase_id, v_next_id, v_old.source_mapping_id, v_date,
      '[Carry-over] ' || v_old.title, v_old.description, v_old.objective, v_old.skill, v_old.duration_minutes,
      'high', 'todo', 'TODO', v_old.target_score, 'automatic', 'carry-' || v_next_id::text || '-' || v_old.id::text)
    returning id into v_new_id;
    insert into public.study_tasks (user_id, lesson_id, position, task_type, title, instructions, question, answer_type, correct_answer, points, metadata)
      select v_user_id, v_new_id, position, task_type, title, instructions, question, answer_type, correct_answer, points,
        metadata || jsonb_build_object('carried_from_task_id', id)
      from public.study_tasks where user_id = v_user_id and lesson_id = v_old.id order by position;
    insert into public.carry_over_items (user_id, from_sprint_id, to_sprint_id, source_lesson_id, target_lesson_id, reason)
    values (v_user_id, p_from_sprint_id, v_next_id, v_old.id, v_new_id, 'UNFINISHED');
    v_index := v_index + 1;
  end loop;

  foreach v_date in array v_dates loop
    select count(*) into v_existing from public.daily_lessons where user_id = v_user_id and week_sprint_id = v_next_id and lesson_date = v_date;
    if v_existing = 0 then
      v_skill := case extract(dow from v_date)::integer when 1 then 'Listening' when 2 then 'Reading' when 3 then 'Writing' when 4 then 'Speaking' when 5 then 'Grammar / Vocab' else 'Review' end;
      insert into public.daily_lessons (user_id, plan_id, week_sprint_id, lesson_date, title, description, objective, skill,
        duration_minutes, priority, status, workflow_status, target_score, generation_source, source_key)
      values (v_user_id, v_from.plan_id, v_next_id, v_date, v_skill || ' · Week ' || v_week_number,
        coalesce(p_objective,''), 'Hoàn thành phiên ' || v_skill || ' theo retrospective tuần trước.', v_skill,
        greatest(15, round(v_plan.weekly_minutes::numeric / cardinality(v_plan.study_days))::integer), 'medium', 'todo', 'TODO',
        case when p_targets ? v_skill then (p_targets ->> v_skill)::numeric else null end,
        'automatic', 'sprint-' || v_next_id::text || '-' || v_date::text);
    end if;
  end loop;
  update public.week_sprints set status = 'COMPLETED' where id = p_from_sprint_id and user_id = v_user_id;
  perform public.ielts_lab_refresh_sprint_kpis(p_from_sprint_id);
  return v_next_id;
end;
$$;

revoke all on function public.ielts_lab_refresh_sprint_kpis(uuid) from public;
revoke all on function public.ielts_lab_record_bug_retest(uuid, uuid, text, text, text) from public;
revoke all on function public.ielts_lab_generate_next_week(uuid, date, text, text, jsonb) from public;
grant execute on function public.ielts_lab_refresh_sprint_kpis(uuid) to authenticated;
grant execute on function public.ielts_lab_record_bug_retest(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.ielts_lab_generate_next_week(uuid, date, text, text, jsonb) to authenticated;

commit;
