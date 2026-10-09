-- Skip only equivalent incoming KM entries; preserve all existing rows.
create or replace function public.km_ignorar_duplicados() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('km_registros_deduplicacao'));
 new.placa:=upper(regexp_replace(new.placa,'[^a-zA-Z0-9]','','g'));
 if exists(select 1 from public.km_registros r
  where r.data is not distinct from new.data
   and upper(regexp_replace(r.placa,'[^a-zA-Z0-9]','','g')) is not distinct from new.placa
   and r.km_realizado is not distinct from new.km_realizado
   and r.volta_serbom is not distinct from new.volta_serbom
   and r.google is not distinct from new.google) then return null;end if;
 return new;
end $$;
revoke execute on function public.km_ignorar_duplicados() from public,anon,authenticated;
create trigger km_ignorar_duplicados before insert on public.km_registros
 for each row execute function public.km_ignorar_duplicados();
