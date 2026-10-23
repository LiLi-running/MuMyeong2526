-- =====================================================================
--  무명의 유산 · 일정에 시간 추가
--  05 다음에 실행하세요. (여러 번 실행해도 안전합니다)
--  시간은 한국 시간 기준으로 입력합니다. 비워 두면 '하루 종일' 일정입니다.
-- =====================================================================
alter table public.schedules add column if not exists start_time time;
alter table public.schedules add column if not exists end_time   time;
