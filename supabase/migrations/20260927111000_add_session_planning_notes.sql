begin;

alter table public.daily_lessons
  add column if not exists planning_notes text not null default '';

comment on column public.daily_lessons.planning_notes is
  'Ghi chú chuẩn bị/kế hoạch riêng cho session, khác với ghi chú kết quả sau buổi học.';

commit;
