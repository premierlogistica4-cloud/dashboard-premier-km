-- Public consultation expressly requested on 13/10.
-- Original source documents stay in non-public columns; incoming records remain append-only.
alter table public.ct_registros add column resumo jsonb not null default '{}';
alter table public.ct_registros add column proveniencia jsonb not null default '{}';
create function public.ct_preparar_exibicao() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.resumo:=new.dados-'motorista'-'observacao';
 new.proveniencia:=jsonb_strip_nulls(jsonb_build_object('arquivo',new.origem->'arquivo','aba',new.origem->'aba','linha',new.origem->'linha','calculado',new.origem->'calculado','total_informado',new.origem->'total_informado','fontes',new.origem->'fontes'));
 return new;
end $$;
revoke execute on function public.ct_preparar_exibicao() from public,anon,authenticated;
create trigger ct_exibicao before insert on public.ct_registros for each row execute function public.ct_preparar_exibicao();
grant select(id,tipo,data,chave,resumo,proveniencia,created_at) on public.ct_registros to anon;
create policy ct_consulta_publica on public.ct_registros for select to anon using(true);
grant select on public.ct_fontes to anon;
create policy ct_fontes_consulta_publica on public.ct_fontes for select to anon using(true);
