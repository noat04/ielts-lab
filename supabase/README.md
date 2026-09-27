# Supabase database

The migrations create a private, multi-user schema for the IELTS Lab dashboard.
Every application table is protected by Row Level Security (RLS) and requires an
authenticated Supabase user.

Study reminders are stored in `study_reminder_settings` and `study_reminders`.
Database triggers keep reminders synchronized with planned lessons and exam events;
browser notifications are delivered by the frontend while the website is open.

## Tables

- `profiles`: user-facing profile data.
- `study_goals`: current, target, and stretch bands plus exam date.
- `bugs`: imported and user-created IELTS errors.
- `study_sessions`: planned and completed study sessions.
- `weekly_progress`: the 24-week plan and imported weekly totals.
- `test_results`: mini-test and full mock-test results.
- `practice_exercises`: daily exercises.
- `exercise_progress`: per-user completion state for exercises.
- `theory_notes`: theory shown beside bug records.
- `learning_resources`: Google Docs, Sheets, books, and other sources.
- `data_imports`: audit history for snapshot and localStorage imports.
- `learning_plans`, `plan_phases`, `daily_lessons`, `exam_events`: personal roadmaps and schedules.
- `diagnostic_assessments`: placement results used by automatic planning.
- Storage bucket `learning-materials`: private user uploads, limited to 50 MB per file.
- `content_articles`: community articles with WordPress-style SEO metadata.
- `vocabulary_topics`, `vocabulary_entries`: shared vocabulary library and bulk imports.
- `week_sprints`: weekly learning sprints and skill targets.
- `learning_source_mappings`: document, unit, page, audio, and exercise mapping.
- `study_tasks`, `task_attempts`: session practice and grading history.
- `session_results`: canonical completed-session result used to create the study log.
- `error_type_catalog`: standardized learning-error taxonomy.
- `bug_retests`: immutable retest history for bug lifecycle decisions.
- `sprint_kpis`: recalculable weekly quality snapshots.
- `weekly_retrospectives`: weekly reflection and next-week focus.
- `carry_over_items`: source-to-target trace for unfinished sessions moved to a new sprint.
- `skill_kpis`: per-skill target, actual score, study time, attempts, and bug count.
- `learning_events`: append-only event stream for the learning workflow and future analytics.
- Storage bucket `speaking-recordings`: private browser recordings for Speaking attempts.
- `learning_resources`: upgraded personal library metadata for local files, Google Drive links, folders, tags, skills, favorites, and preview state.

## Apply locally

Initialize Supabase if `supabase/config.toml` does not exist, then run:

```bash
supabase init
supabase start
supabase db reset
```

To apply the migrations to a linked remote project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Deploy the optional AI learning coach after setting its server-side secret:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase secrets set OPENAI_MODEL=gpt-5-mini
supabase functions deploy learning-coach
supabase functions deploy parse-vocabulary-file
```

Generate frontend database types after applying the migrations:

```bash
supabase gen types typescript --local > lib/database.types.ts
```

Do not put a service-role key in the browser. The frontend should use a
publishable/anonymous key and an authenticated session; RLS determines which
rows the user can access.

## Current frontend field mapping

| Current field | Supabase field |
| --- | --- |
| `Bug.id` | `bugs.code` |
| `Bug.date` | `bugs.detected_on` |
| `Bug.original` | `bugs.original_text` |
| `Bug.fix` | `bugs.correction` |
| `StudySession.date` | `study_sessions.study_date` |
| `StudySession.duration` | `study_sessions.duration_minutes` |
| `deadline` | `study_goals.exam_date` |

The migrations intentionally do not seed personal snapshot data because every
row must belong to a real `auth.users.id`. The frontend imports the TypeScript
snapshot and existing localStorage state automatically after the user's first
successful sign-in, then records both operations in `data_imports`.
