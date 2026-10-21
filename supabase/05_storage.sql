-- =====================================================================
--  무명의 유산 · 그림 업로드 저장소
--  04_features.sql 다음에 실행하세요. (여러 번 실행해도 안전합니다)
--
--  - 'uploads' 버킷: 과제 그림, 안내글 그림, 상점·캐릭터 이미지
--  - 이미지 파일만, 1개당 5MB까지
--  - 각자 자기 폴더(계정 id)에만 올릴 수 있고, 관리자는 어디든 가능
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "uploads: 본인 폴더에 올리기" on storage.objects;
create policy "uploads: 본인 폴더에 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads'
              and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "uploads: 본인 파일 삭제" on storage.objects;
create policy "uploads: 본인 파일 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
