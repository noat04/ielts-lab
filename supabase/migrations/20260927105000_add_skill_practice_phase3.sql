begin;

insert into public.error_type_catalog (code, category, label, description, sort_order) values
  ('ANCHOR', 'COMPREHENSION', 'Không xác định được anchor', 'Không chọn được từ khóa ổn định trước khi nghe.', 11),
  ('SOUND', 'COMPREHENSION', 'Không nhận ra âm', 'Không nhận diện được từ hoặc cụm từ trong audio.', 12),
  ('ATTRIBUTION', 'COMPREHENSION', 'Sai đối tượng được quy chiếu', 'Gán thông tin cho sai người, nghiên cứu hoặc đoạn.', 41),
  ('GRAMMAR_PREDICTION', 'LANGUAGE', 'Sai dự đoán ngữ pháp', 'Dự đoán sai từ loại hoặc cấu trúc của chỗ trống.', 61),
  ('SUBJECT_VERB', 'LANGUAGE', 'Subject–verb', 'Câu thiếu hoặc sai quan hệ giữa chủ ngữ và động từ.', 71),
  ('TENSE', 'LANGUAGE', 'Thì', 'Dùng sai hoặc không nhất quán về thì.', 72),
  ('ARTICLE', 'LANGUAGE', 'Mạo từ', 'Thiếu hoặc dùng sai a, an, the.', 73),
  ('WORD_FORM', 'LANGUAGE', 'Dạng từ', 'Dùng sai noun, verb, adjective hoặc adverb.', 74),
  ('WORD_CHOICE', 'LANGUAGE', 'Lựa chọn từ', 'Từ đúng nghĩa gần nhưng không phù hợp ngữ cảnh.', 75),
  ('COLLOCATION', 'LANGUAGE', 'Collocation', 'Kết hợp từ chưa tự nhiên hoặc không chính xác.', 76),
  ('CONNECTOR', 'PRODUCTION', 'Từ nối', 'Liên kết ý chưa đúng chức năng hoặc thiếu tự nhiên.', 101),
  ('PAUSE', 'PRODUCTION', 'Ngập ngừng', 'Có khoảng dừng dài làm giảm độ trôi chảy.', 111),
  ('REPETITION', 'PRODUCTION', 'Lặp từ hoặc ý', 'Lặp lại từ, cấu trúc hoặc nội dung không cần thiết.', 112),
  ('INCOMPLETE_SENTENCE', 'PRODUCTION', 'Câu chưa hoàn chỉnh', 'Câu nói hoặc câu viết thiếu thành phần bắt buộc.', 113)
on conflict (code) do nothing;

alter table public.study_tasks
  add column workflow_type text not null default 'STANDARD',
  add column workflow_config jsonb not null default '{}'::jsonb,
  add constraint study_tasks_workflow_type_valid check (
    workflow_type in ('STANDARD', 'LISTENING_PREDICTION', 'READING_EVIDENCE', 'SENTENCE_COMPLETION', 'WRITING_AREA', 'SPEAKING_CUE_CARD')
  ),
  add constraint study_tasks_workflow_config_object check (jsonb_typeof(workflow_config) = 'object');

alter table public.task_attempts
  add column structured_response jsonb not null default '{}'::jsonb,
  add column audio_path text,
  add column audio_duration_seconds integer,
  add constraint task_attempts_structured_response_object check (jsonb_typeof(structured_response) = 'object'),
  add constraint task_attempts_audio_duration_valid check (
    audio_duration_seconds is null or audio_duration_seconds between 1 and 3600
  );

create table public.skill_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sprint_id uuid not null,
  skill text not null,
  metric text not null default 'ACCURACY',
  target_value numeric(7,2),
  actual_value numeric(7,2),
  status text not null default 'NO_DATA',
  completed_sessions integer not null default 0,
  total_attempts integer not null default 0,
  correct_attempts integer not null default 0,
  study_minutes integer not null default 0,
  bug_count integer not null default 0,
  calculated_at timestamptz not null default now(),
  foreign key (user_id, sprint_id) references public.week_sprints (user_id, id) on delete cascade,
  constraint skill_kpis_skill_valid check (skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab')),
  constraint skill_kpis_metric_valid check (metric in ('ACCURACY', 'SELF_CHECK', 'COMPLETION')),
  constraint skill_kpis_status_valid check (status in ('NO_DATA', 'NOT_MET', 'PASS')),
  constraint skill_kpis_values_valid check (
    (target_value is null or target_value between 0 and 100)
    and (actual_value is null or actual_value between 0 and 100)
    and completed_sessions >= 0 and total_attempts >= 0 and correct_attempts >= 0
    and study_minutes >= 0 and bug_count >= 0
  ),
  unique (user_id, sprint_id, skill),
  unique (user_id, id)
);

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  sprint_id uuid,
  lesson_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (user_id, sprint_id) references public.week_sprints (user_id, id) on delete set null (sprint_id),
  foreign key (user_id, lesson_id) references public.daily_lessons (user_id, id) on delete set null (lesson_id),
  constraint learning_events_type_valid check (event_type in (
    'WEEK_CREATED', 'SESSION_CREATED', 'SESSION_STARTED', 'TASK_STARTED', 'ANSWER_SUBMITTED',
    'TASK_GRADED', 'ERROR_DETECTED', 'BUG_CREATED', 'BUG_RETESTED', 'BUG_RESOLVED',
    'SESSION_COMPLETED', 'KPI_UPDATED', 'WEEK_REVIEWED', 'WEEK_COMPLETED', 'NEXT_WEEK_GENERATED'
  )),
  constraint learning_events_entity_not_blank check (char_length(btrim(entity_type)) between 1 and 60),
  constraint learning_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index skill_kpis_sprint_idx on public.skill_kpis (sprint_id, skill);
create index learning_events_user_date_idx on public.learning_events (user_id, occurred_at desc);
create index learning_events_sprint_idx on public.learning_events (sprint_id, occurred_at);

alter table public.skill_kpis enable row level security;
alter table public.learning_events enable row level security;
grant select, insert, update, delete on table public.skill_kpis to authenticated;
grant select, insert on table public.learning_events to authenticated;

create policy "skill_kpis_own_all" on public.skill_kpis for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "learning_events_own_select" on public.learning_events for select to authenticated
using ((select auth.uid()) = user_id);
create policy "learning_events_own_insert" on public.learning_events for insert to authenticated
with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'speaking-recordings', 'speaking-recordings', false, 26214400,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "speaking_recordings_select_own" on storage.objects for select to authenticated
using (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "speaking_recordings_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "speaking_recordings_update_own" on storage.objects for update to authenticated
using (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "speaking_recordings_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'speaking-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.ielts_lab_refresh_skill_kpis(p_sprint_id uuid)
returns setof public.skill_kpis
language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_skill text;
  v_target numeric(7,2);
  v_session_actual numeric(7,2);
  v_actual numeric(7,2);
  v_completed integer;
  v_total integer;
  v_correct integer;
  v_minutes integer;
  v_bugs integer;
  v_metric text;
  v_status text;
begin
  if not exists (select 1 from public.week_sprints where id = p_sprint_id and user_id = v_user_id) then
    raise exception 'Sprint not found';
  end if;

  foreach v_skill in array array['Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab'] loop
    select round(avg(target_score), 2), round(avg(actual_score), 2),
      count(*) filter (where workflow_status = 'DONE')
    into v_target, v_session_actual, v_completed
    from public.daily_lessons
    where user_id = v_user_id and week_sprint_id = p_sprint_id and skill = v_skill;

    with latest as (
      select distinct on (a.task_id) a.is_correct
      from public.task_attempts a
      join public.study_tasks t on t.id = a.task_id and t.user_id = a.user_id
      join public.daily_lessons dl on dl.id = t.lesson_id and dl.user_id = t.user_id
      where a.user_id = v_user_id and dl.week_sprint_id = p_sprint_id and dl.skill = v_skill
      order by a.task_id, a.attempt_number desc
    ) select count(*), count(*) filter (where is_correct is true)
      into v_total, v_correct from latest;

    select coalesce(sum(sr.duration_minutes), 0) into v_minutes
    from public.session_results sr
    join public.daily_lessons dl on dl.id = sr.lesson_id and dl.user_id = sr.user_id
    where sr.user_id = v_user_id and dl.week_sprint_id = p_sprint_id and dl.skill = v_skill;

    select count(*) into v_bugs from public.bugs b
    join public.daily_lessons dl on dl.id = b.daily_lesson_id and dl.user_id = b.user_id
    where b.user_id = v_user_id and dl.week_sprint_id = p_sprint_id and dl.skill = v_skill;

    v_actual := case when v_total > 0 then round(v_correct::numeric * 100 / v_total, 2) else v_session_actual end;
    v_metric := case when v_total > 0 then 'ACCURACY' when v_completed > 0 then 'COMPLETION' else 'ACCURACY' end;
    v_status := case when v_actual is null then 'NO_DATA' when v_target is null or v_actual >= v_target then 'PASS' else 'NOT_MET' end;

    insert into public.skill_kpis (user_id, sprint_id, skill, metric, target_value, actual_value, status,
      completed_sessions, total_attempts, correct_attempts, study_minutes, bug_count, calculated_at)
    values (v_user_id, p_sprint_id, v_skill, v_metric, v_target, v_actual, v_status,
      v_completed, v_total, v_correct, v_minutes, v_bugs, now())
    on conflict (user_id, sprint_id, skill) do update set
      metric = excluded.metric, target_value = excluded.target_value, actual_value = excluded.actual_value, status = excluded.status,
      completed_sessions = excluded.completed_sessions, total_attempts = excluded.total_attempts,
      correct_attempts = excluded.correct_attempts, study_minutes = excluded.study_minutes,
      bug_count = excluded.bug_count, calculated_at = excluded.calculated_at;
  end loop;

  return query select * from public.skill_kpis where user_id = v_user_id and sprint_id = p_sprint_id order by skill;
end;
$$;

create or replace function public.ielts_lab_capture_week_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, payload)
  values (new.user_id, 'WEEK_CREATED', 'week_sprint', new.id, new.id, jsonb_build_object('week_number', new.week_number));
  return new;
end;
$$;

create or replace function public.ielts_lab_capture_session_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_type text;
begin
  if tg_op = 'INSERT' then v_type := 'SESSION_CREATED';
  elsif new.workflow_status = 'DONE' and old.workflow_status is distinct from 'DONE' then v_type := 'SESSION_COMPLETED';
  elsif new.started_at is not null and old.started_at is null then v_type := 'SESSION_STARTED';
  else return new;
  end if;
  insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, lesson_id, payload)
  values (new.user_id, v_type, 'daily_lesson', new.id, new.week_sprint_id, new.id, jsonb_build_object('skill', new.skill));
  return new;
end;
$$;

create or replace function public.ielts_lab_capture_attempt_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_lesson_id uuid; v_sprint_id uuid;
begin
  select t.lesson_id, dl.week_sprint_id into v_lesson_id, v_sprint_id
  from public.study_tasks t join public.daily_lessons dl on dl.id = t.lesson_id
  where t.id = new.task_id and t.user_id = new.user_id;
  insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, lesson_id, payload)
  values
    (new.user_id, 'ANSWER_SUBMITTED', 'task_attempt', new.id, v_sprint_id, v_lesson_id, jsonb_build_object('task_id', new.task_id, 'attempt', new.attempt_number)),
    (new.user_id, 'TASK_GRADED', 'task_attempt', new.id, v_sprint_id, v_lesson_id, jsonb_build_object('is_correct', new.is_correct, 'score', new.score));
  return new;
end;
$$;

create or replace function public.ielts_lab_capture_bug_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_sprint_id uuid; v_type text;
begin
  select week_sprint_id into v_sprint_id from public.daily_lessons where id = new.daily_lesson_id and user_id = new.user_id;
  if tg_op = 'INSERT' then v_type := 'BUG_CREATED';
  elsif new.lifecycle_status = 'RESOLVED' and old.lifecycle_status is distinct from 'RESOLVED' then v_type := 'BUG_RESOLVED';
  else return new;
  end if;
  if tg_op = 'INSERT' then
    insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, lesson_id, payload)
    values
      (new.user_id, 'ERROR_DETECTED', 'bug', new.id, v_sprint_id, new.daily_lesson_id, jsonb_build_object('error_type', new.error_type, 'skill', new.skill)),
      (new.user_id, 'BUG_CREATED', 'bug', new.id, v_sprint_id, new.daily_lesson_id, jsonb_build_object('error_type', new.error_type, 'skill', new.skill));
  else
    insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, lesson_id, payload)
    values (new.user_id, v_type, 'bug', new.id, v_sprint_id, new.daily_lesson_id,
      jsonb_build_object('error_type', new.error_type, 'skill', new.skill));
  end if;
  return new;
end;
$$;

create or replace function public.ielts_lab_capture_retest_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_lesson_id uuid;
begin
  if new.result = 'PENDING' or (tg_op = 'UPDATE' and new.result is not distinct from old.result) then return new; end if;
  select daily_lesson_id into v_lesson_id from public.bugs where id = new.bug_id and user_id = new.user_id;
  insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, lesson_id, payload)
  values (new.user_id, 'BUG_RETESTED', 'bug_retest', new.id, new.sprint_id, v_lesson_id,
    jsonb_build_object('bug_id', new.bug_id, 'result', new.result));
  return new;
end;
$$;

create or replace function public.ielts_lab_capture_kpi_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, payload)
  values (new.user_id, 'KPI_UPDATED', 'sprint_kpi', new.id, new.sprint_id,
    jsonb_build_object('overall_score', new.overall_score, 'adherence', new.adherence_percent));
  return new;
end;
$$;

create or replace function public.ielts_lab_capture_review_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.learning_events (user_id, event_type, entity_type, entity_id, sprint_id, payload)
  values (new.user_id, 'WEEK_REVIEWED', 'weekly_retrospective', new.id, new.sprint_id,
    jsonb_build_object('energy_score', new.energy_score, 'confidence_score', new.confidence_score));
  return new;
end;
$$;

create trigger week_sprints_capture_event after insert on public.week_sprints
for each row execute function public.ielts_lab_capture_week_event();
create trigger daily_lessons_capture_event after insert or update of workflow_status, started_at on public.daily_lessons
for each row execute function public.ielts_lab_capture_session_event();
create trigger task_attempts_capture_event after insert on public.task_attempts
for each row execute function public.ielts_lab_capture_attempt_event();
create trigger bugs_capture_event after insert or update of lifecycle_status on public.bugs
for each row execute function public.ielts_lab_capture_bug_event();
create trigger bug_retests_capture_event after insert or update of result on public.bug_retests
for each row execute function public.ielts_lab_capture_retest_event();
create trigger sprint_kpis_capture_event after insert or update on public.sprint_kpis
for each row execute function public.ielts_lab_capture_kpi_event();
create trigger weekly_retrospectives_capture_event after insert or update on public.weekly_retrospectives
for each row execute function public.ielts_lab_capture_review_event();

revoke all on function public.ielts_lab_refresh_skill_kpis(uuid) from public;
grant execute on function public.ielts_lab_refresh_skill_kpis(uuid) to authenticated;

commit;
