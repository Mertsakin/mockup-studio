-- Account deletion (docs/uyelik.md §5, step 5: "Hesabı sil"). The user deletes their own account: the profile row
-- goes (projects, media and project_media cascade from it), then the auth.users row itself (identities, sessions and
-- refresh tokens cascade from that), all in one transaction. Called by the storage Worker (DELETE /account) with the
-- user's own token after it has removed the user's files from R2, so no service role key is needed for it. Signing in
-- again with the same e-mail starts from nothing (a new user, a new profile). Returns what was removed.
create function public.delete_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); np int; nm int;
begin
  if uid is null then raise exception 'auth' using errcode = '28000'; end if;
  select count(*) into np from public.projects where owner = uid;
  select count(*) into nm from public.media where owner = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
  return jsonb_build_object('projects', np, 'media', nm);
end $$;
revoke execute on function public.delete_account from public, anon;
grant execute on function public.delete_account to authenticated;
