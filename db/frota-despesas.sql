-- Acréscimo ao acesso compartilhado sem login expressamente autorizado pelo usuário.
create table public.frota_despesas (
 id bigint generated always as identity primary key,
 registro_id bigint references public.frota_registros(id),
 tipo text not null check(tipo in ('diesel','pedagio')), data date not null,
 placa text not null check(placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
 operacao text references public.frota_operacoes(codigo),
 viagem text not null default '', periodo_inicio date, periodo_fim date,
 em_andamento boolean not null default false,
 valor numeric(14,2) not null check(valor>=0), litros numeric(14,3) check(litros>0),
 preco_litro numeric(14,4) check(preco_litro>0),
 praca text not null default '', rodovia text not null default '', sentido text not null default '',
 horario text not null default '', tipo_veiculo text not null default '', natureza text not null default '', pagamento text not null default '', categoria text not null default '', observacao text not null default '',
 origem jsonb not null default '{}', chave text not null,
 deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(periodo_fim is null or periodo_inicio is null or periodo_fim>=periodo_inicio),
 check(not em_andamento or periodo_fim is null),
 check(tipo='diesel' or (litros is null and preco_litro is null))
);
create unique index frota_despesas_chave on public.frota_despesas(chave) where deleted_at is null;
create index frota_despesas_registro on public.frota_despesas(registro_id) where deleted_at is null;
create index frota_despesas_filtro on public.frota_despesas(operacao,placa,data) where deleted_at is null;
alter table public.frota_despesas enable row level security;
revoke all on public.frota_despesas from anon,authenticated;
grant select,insert,update on public.frota_despesas to anon,authenticated;
grant usage,select on sequence public.frota_despesas_id_seq to anon,authenticated;
create policy despesas_leitura on public.frota_despesas for select to anon,authenticated using(true);
create policy despesas_insercao on public.frota_despesas for insert to anon,authenticated with check(deleted_at is null);
create policy despesas_edicao on public.frota_despesas for update to anon,authenticated using(true) with check(true);
create function public.frota_despesa_normalizar() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.placa:=upper(regexp_replace(new.placa,'[^a-zA-Z0-9]','','g'));
 if new.registro_id is not null and not exists(select 1 from public.frota_registros where id=new.registro_id and placa=new.placa and deleted_at is null) then raise exception 'Vínculo inválido: selecione um registro ativo da mesma placa.';end if;
 new.updated_at:=now();
 new.chave:=md5(jsonb_build_array(new.tipo,new.data,new.placa,new.operacao,new.viagem,coalesce(new.origem->>'arquivo',''),coalesce(new.origem->>'aba',''),coalesce(new.origem->>'linha',new.origem->>'manual',jsonb_build_array(new.valor,new.litros,new.praca,new.rodovia,new.sentido)::text))::text);
 return new;
end $$;
create trigger despesas_normalizar before insert or update on public.frota_despesas for each row execute function public.frota_despesa_normalizar();
create table frota_private.despesas_audit(id bigint generated always as identity primary key, despesa_id bigint, acao text, antes jsonb,depois jsonb,created_at timestamptz not null default now());
alter table frota_private.despesas_audit enable row level security;
create function frota_private.auditar_despesa() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into frota_private.despesas_audit(despesa_id,acao,antes,depois) values(coalesce(new.id,old.id),TG_OP,case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);return coalesce(new,old);end $$;
revoke all on function frota_private.auditar_despesa() from public,anon,authenticated;
create trigger despesas_auditoria after insert or update or delete on public.frota_despesas for each row execute function frota_private.auditar_despesa();
create or replace function public.frota_importar_despesas(p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; v public.frota_despesas; oldrow public.frota_despesas; n integer:=0; d integer:=0;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>10000 then raise exception 'Envie de 1 a 10000 despesas.';end if;
 perform pg_advisory_xact_lock(hashtext('frota_despesas'));
 for r in select value from jsonb_array_elements(p_rows) loop
  select * into v from jsonb_populate_record(null::public.frota_despesas,r);
  v.placa:=upper(regexp_replace(v.placa,'[^a-zA-Z0-9]','','g'));
  v.viagem:=coalesce(v.viagem,'');v.origem:=coalesce(v.origem,'{}');
  v.chave:=md5(jsonb_build_array(v.tipo,v.data,v.placa,v.operacao,v.viagem,coalesce(v.origem->>'arquivo',''),coalesce(v.origem->>'aba',''),coalesce(v.origem->>'linha',v.origem->>'manual',jsonb_build_array(v.valor,v.litros,coalesce(v.praca,''),coalesce(v.rodovia,''),coalesce(v.sentido,''))::text))::text);
  select * into oldrow from public.frota_despesas where chave=v.chave and deleted_at is null;
  if found then
   if oldrow.valor is distinct from v.valor or oldrow.litros is distinct from v.litros or oldrow.preco_litro is distinct from v.preco_litro or oldrow.registro_id is distinct from v.registro_id or oldrow.periodo_inicio is distinct from v.periodo_inicio or oldrow.periodo_fim is distinct from v.periodo_fim or oldrow.em_andamento is distinct from coalesce(v.em_andamento,false) or oldrow.praca is distinct from coalesce(v.praca,'') or oldrow.rodovia is distinct from coalesce(v.rodovia,'') or oldrow.sentido is distinct from coalesce(v.sentido,'') or oldrow.pagamento is distinct from coalesce(v.pagamento,'') or oldrow.categoria is distinct from coalesce(v.categoria,'') or oldrow.horario is distinct from coalesce(v.horario,'') or oldrow.tipo_veiculo is distinct from coalesce(v.tipo_veiculo,'') or oldrow.natureza is distinct from coalesce(v.natureza,'') or oldrow.observacao is distinct from coalesce(v.observacao,'') then raise exception 'Despesa já importada com alterações. Edite o lançamento original: % %',v.data,v.placa;end if;
   d:=d+1;
  else
   insert into public.frota_despesas(registro_id,tipo,data,placa,operacao,viagem,periodo_inicio,periodo_fim,em_andamento,valor,litros,preco_litro,praca,rodovia,sentido,horario,tipo_veiculo,natureza,pagamento,categoria,observacao,origem,chave)
   values(v.registro_id,v.tipo,v.data,v.placa,v.operacao,v.viagem,v.periodo_inicio,v.periodo_fim,coalesce(v.em_andamento,false),v.valor,v.litros,v.preco_litro,coalesce(v.praca,''),coalesce(v.rodovia,''),coalesce(v.sentido,''),coalesce(v.horario,''),coalesce(v.tipo_veiculo,''),coalesce(v.natureza,''),coalesce(v.pagamento,''),coalesce(v.categoria,''),coalesce(v.observacao,''),v.origem,v.chave);n:=n+1;
  end if;
 end loop;
 return jsonb_build_object('importados',n,'duplicados',d);
end $$;
revoke all on function public.frota_importar_despesas(jsonb) from public;
grant execute on function public.frota_importar_despesas(jsonb) to anon,authenticated;
