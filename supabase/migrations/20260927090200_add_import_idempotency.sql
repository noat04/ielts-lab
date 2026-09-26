begin;

alter table public.study_sessions
  add column source_key text,
  add column origin text not null default 'user',
  add constraint study_sessions_origin_valid
    check (origin in ('snapshot', 'user', 'import')),
  add constraint study_sessions_user_source_key_unique
    unique (user_id, source_key);

alter table public.test_results
  add column source_key text,
  add constraint test_results_user_source_key_unique
    unique (user_id, source_key);

alter table public.data_imports
  add constraint data_imports_user_source_unique
    unique (user_id, source_type, source_name);

commit;
