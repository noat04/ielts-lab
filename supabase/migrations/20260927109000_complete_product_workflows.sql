begin;

create or replace function public.ielts_lab_import_week_sprint(
  p_plan_id uuid,
  p_start_date date,
  p_title text,
  p_objective text,
  p_targets jsonb,
  p_sessions jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sprint_id uuid;
  v_week_number integer;
  v_session jsonb;
  v_task jsonb;
  v_lesson_id uuid;
  v_phase_id uuid;
  v_source_id uuid;
  v_position integer;
  v_session_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.learning_plans where id = p_plan_id and user_id = v_user_id) then
    raise exception 'Learning plan not found';
  end if;
  if jsonb_typeof(coalesce(p_sessions, '[]'::jsonb)) <> 'array' then raise exception 'Sessions must be an array'; end if;
  v_session_count := jsonb_array_length(coalesce(p_sessions, '[]'::jsonb));
  if v_session_count < 1 or v_session_count > 100 then raise exception 'Import requires 1 to 100 sessions'; end if;

  select coalesce(max(week_number), 0) + 1 into v_week_number
  from public.week_sprints where user_id = v_user_id and plan_id = p_plan_id;

  insert into public.week_sprints (
    user_id, plan_id, week_number, start_date, end_date, title, objective, skill_targets, status
  ) values (
    v_user_id, p_plan_id, v_week_number, p_start_date, p_start_date + 6,
    coalesce(nullif(btrim(p_title), ''), 'Week ' || v_week_number), coalesce(p_objective, ''), coalesce(p_targets, '{}'::jsonb), 'PLANNED'
  ) returning id into v_sprint_id;

  for v_session in select value from jsonb_array_elements(p_sessions)
  loop
    if (v_session ->> 'date')::date < p_start_date or (v_session ->> 'date')::date > p_start_date + 6 then
      raise exception 'Session date % is outside sprint range', v_session ->> 'date';
    end if;

    select id into v_phase_id from public.plan_phases
    where user_id = v_user_id and plan_id = p_plan_id
      and (v_session ->> 'date')::date between start_date and end_date
    order by position limit 1;
    v_source_id := null;

    if nullif(btrim(coalesce(v_session ->> 'sourceTitle', '')), '') is not null
       or nullif(btrim(coalesce(v_session ->> 'sourceUrl', '')), '') is not null then
      select id into v_source_id from public.learning_source_mappings
      where user_id = v_user_id and plan_id = p_plan_id
        and lower(document_title) = lower(coalesce(nullif(btrim(v_session ->> 'sourceTitle'), ''), 'Tài liệu import'))
        and coalesce(source_url, '') = coalesce(nullif(btrim(v_session ->> 'sourceUrl'), ''), '')
      order by created_at limit 1;
      if v_source_id is null then
        insert into public.learning_source_mappings (
          user_id, plan_id, document_title, source_url, notes
        ) values (
          v_user_id, p_plan_id,
          coalesce(nullif(btrim(v_session ->> 'sourceTitle'), ''), 'Tài liệu import'),
          nullif(btrim(v_session ->> 'sourceUrl'), ''),
          'Tạo tự động từ file Weekly Sprint'
        ) returning id into v_source_id;
      end if;
    end if;

    insert into public.daily_lessons (
      user_id, plan_id, phase_id, week_sprint_id, source_mapping_id, lesson_date, study_time,
      title, description, objective, skill, duration_minutes, priority, status, workflow_status,
      target_score, generation_source, source_key
    ) values (
      v_user_id, p_plan_id, v_phase_id, v_sprint_id, v_source_id, (v_session ->> 'date')::date,
      case when coalesce(v_session ->> 'studyTime', '') = '' then null else (v_session ->> 'studyTime')::time end,
      v_session ->> 'title', coalesce(v_session ->> 'objective', ''), coalesce(v_session ->> 'objective', ''),
      v_session ->> 'skill', greatest(5, least(1440, coalesce((v_session ->> 'duration')::integer, 30))),
      'medium', 'todo', 'TODO', nullif(v_session ->> 'targetScore', '')::numeric,
      'manual', 'sprint-import-' || v_sprint_id::text || '-' || gen_random_uuid()::text
    ) returning id into v_lesson_id;

    v_position := 0;
    for v_task in select value from jsonb_array_elements(coalesce(v_session -> 'tasks', '[]'::jsonb))
    loop
      insert into public.study_tasks (
        user_id, lesson_id, position, task_type, title, instructions, question,
        answer_type, correct_answer, points, metadata, workflow_type, workflow_config
      ) values (
        v_user_id, v_lesson_id, v_position, coalesce(v_task ->> 'taskType', 'practice'),
        v_task ->> 'title', 'Task được nhập từ file Weekly Sprint',
        coalesce(nullif(v_task ->> 'question', ''), v_task ->> 'title'),
        coalesce(v_task ->> 'answerType', 'text'), coalesce(v_task ->> 'correctAnswer', ''),
        1, jsonb_build_object('imported', true), 'STANDARD', '{}'::jsonb
      );
      v_position := v_position + 1;
    end loop;
  end loop;

  return v_sprint_id;
end;
$$;

create or replace function public.ielts_lab_update_week_sprint(
  p_sprint_id uuid,
  p_start_date date,
  p_title text,
  p_objective text,
  p_targets jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous_start date;
  v_offset integer;
begin
  select start_date into v_previous_start from public.week_sprints
  where id = p_sprint_id and user_id = v_user_id for update;
  if v_previous_start is null then raise exception 'Sprint not found'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'Sprint title is required'; end if;
  if jsonb_typeof(coalesce(p_targets, '{}'::jsonb)) <> 'object' then raise exception 'Targets must be an object'; end if;
  v_offset := p_start_date - v_previous_start;
  update public.week_sprints set
    start_date = p_start_date,
    end_date = p_start_date + 6,
    title = btrim(p_title),
    objective = coalesce(p_objective, ''),
    skill_targets = coalesce(p_targets, '{}'::jsonb)
  where id = p_sprint_id and user_id = v_user_id;
  if v_offset <> 0 then
    update public.daily_lessons set lesson_date = lesson_date + v_offset
    where week_sprint_id = p_sprint_id and user_id = v_user_id;
  end if;
end;
$$;

create or replace function public.ielts_lab_delete_week_sprint(p_sprint_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.week_sprints where id = p_sprint_id and user_id = v_user_id) then
    raise exception 'Sprint not found';
  end if;
  delete from public.daily_lessons where user_id = v_user_id and week_sprint_id = p_sprint_id;
  delete from public.week_sprints where user_id = v_user_id and id = p_sprint_id;
end;
$$;

revoke all on function public.ielts_lab_import_week_sprint(uuid, date, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.ielts_lab_delete_week_sprint(uuid) from public, anon;
revoke all on function public.ielts_lab_update_week_sprint(uuid, date, text, text, jsonb) from public, anon;
grant execute on function public.ielts_lab_import_week_sprint(uuid, date, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.ielts_lab_delete_week_sprint(uuid) to authenticated;
grant execute on function public.ielts_lab_update_week_sprint(uuid, date, text, text, jsonb) to authenticated;

commit;
