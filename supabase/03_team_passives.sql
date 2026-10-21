-- =====================================================================
--  무명의 유산 · 팀 패시브 업데이트
--  이미 01, 02를 실행한 데이터베이스용입니다.
--  1) 이 파일을 실행  →  2) 02_battle_functions.sql 을 다시 한 번 전체 실행
--  (처음 설치하는 경우에는 01 → 02 → 03 순서로 실행해도 문제없습니다.)
-- =====================================================================

-- 팀을 A/B/C 고정에서 자유 입력(팀 이름)으로
alter table public.profiles       drop constraint if exists profiles_team_check;
alter table public.battle_parties drop constraint if exists battle_parties_team_check;
