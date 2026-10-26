
-- Cadastro persistente das viagens, sem alterar registros ou despesas oficiais.
create table public.frota_viagens_cadastro (
 registro_id bigint primary key references public.frota_registros(id),
 created_at timestamptz not null default now()
);
alter table public.frota_viagens_cadastro enable row level security;
create policy viagens_leitura on public.frota_viagens_cadastro for select to anon,authenticated using (
 exists(select 1 from public.frota_registros r where r.id=registro_id and r.deleted_at is null)
);
create policy viagens_registro on public.frota_viagens_cadastro for insert to anon,authenticated with check (
 exists(select 1 from public.frota_registros r where r.id=registro_id and r.deleted_at is null)
);
grant select,insert on public.frota_viagens_cadastro to anon,authenticated;
create function frota_private.cadastrar_viagem() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.frota_viagens_cadastro(registro_id) values(new.id) on conflict do nothing;
 return new;
end $$;
revoke all on function frota_private.cadastrar_viagem() from public;
grant execute on function frota_private.cadastrar_viagem() to anon,authenticated;
create trigger frota_cadastrar_viagem after insert on public.frota_registros
for each row execute function frota_private.cadastrar_viagem();
insert into public.frota_viagens_cadastro(registro_id)
select id from public.frota_registros where deleted_at is null on conflict do nothing;

create view public.frota_viagens_api with (security_invoker=true) as
select c.registro_id as id,r.operacao,r.placa,r.motorista,
 coalesce(e.periodo_inicio,r.data) as data,
 coalesce(e.periodo_fim,r.data_fim) as data_fim,
 r.km_inicial,r.km_final,r.km_total,
 coalesce(nullif(btrim(n.viagem),''),'') as numero_operacao,
 case when nullif(btrim(r.rota),'') is null then r.partida else r.rota end as finalidade,
 (nullif(btrim(r.rota),'') is null) as sem_destino,
 coalesce(e.em_andamento,false) as em_andamento
from public.frota_viagens_cadastro c
join public.frota_registros r on r.id=c.registro_id
left join lateral (
 select d.periodo_inicio,d.periodo_fim,d.em_andamento from public.frota_despesas d
 where d.registro_id=r.id and d.deleted_at is null
 order by (d.periodo_inicio is not null) desc,d.id limit 1
) e on true
left join lateral (
 select d.viagem from public.frota_despesas d
 where d.registro_id=r.id and d.deleted_at is null and nullif(btrim(d.viagem),'') is not null
 order by d.id limit 1
) n on true
where r.deleted_at is null;
grant select on public.frota_viagens_api to anon,authenticated;

-- Identificação distingue datas, motorista e os dois hodômetros.
create or replace function public.frota_normalizar() returns trigger
language plpgsql security invoker set search_path='' as $$
declare previous public.frota_registros;
begin
 new.placa:=upper(regexp_replace(new.placa,'[^a-zA-Z0-9]','','g'));
 new.motorista:=upper(regexp_replace(trim(new.motorista),'\s+',' ','g'));
 new.km_total:=case when new.km_final is not null and new.km_inicial is not null then new.km_final-new.km_inicial else new.km_declarado end;
 if TG_OP='INSERT' then
  perform pg_advisory_xact_lock(hashtext('frota_importar'));
  select r.* into previous from public.frota_registros r
  where r.deleted_at is null and r.data=new.data and r.data_fim=new.data_fim
    and r.operacao=new.operacao and r.placa=new.placa and r.motorista=new.motorista
    and r.km_inicial is not distinct from new.km_inicial
    and r.km_final is not distinct from new.km_final
    and r.km_declarado is not distinct from new.km_declarado
    and r.partida is not distinct from new.partida and r.rota is not distinct from new.rota
  order by r.id limit 1;
  if found then
   if previous.diesel is not distinct from new.diesel and previous.litros is not distinct from new.litros
    and previous.preco_litro is not distinct from new.preco_litro and previous.pedagio is not distinct from new.pedagio
    and previous.observacao is not distinct from new.observacao then return null;
   else raise exception 'Mesma viagem com abastecimentos ou valores diferentes. Importe os comprovantes como despesas vinculadas à viagem para preservar o KM único.';
   end if;
  end if;
 end if;
 if TG_OP='INSERT' then
  new.chave:=md5(jsonb_build_array(new.data,new.data_fim,new.operacao,new.placa,new.motorista,new.km_inicial,new.km_final,new.km_declarado,new.partida,new.rota)::text);
 elsif jsonb_build_array(new.data,new.data_fim,new.operacao,new.placa,new.motorista,new.km_inicial,new.km_final,new.km_declarado,new.partida,new.rota)
  is distinct from jsonb_build_array(old.data,old.data_fim,old.operacao,old.placa,old.motorista,old.km_inicial,old.km_final,old.km_declarado,old.partida,old.rota) then
  new.chave:=md5(jsonb_build_array(new.data,new.data_fim,new.operacao,new.placa,new.motorista,new.km_inicial,new.km_final,new.km_declarado,new.partida,new.rota)::text);
 end if;
 new.updated_at:=now();
 return new;
end $$;
notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.frota_importar(p_arquivo text, p_fingerprint text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare iid bigint; r jsonb; v public.frota_registros; existente public.frota_registros; inseridos integer:=0; duplicados integer:=0; rid bigint;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>10000 then raise exception 'Importação deve conter entre 1 e 10000 registros.';end if;
 if length(p_fingerprint)<10 then raise exception 'Identificação do arquivo inválida.';end if;
 perform pg_advisory_xact_lock(hashtext('frota_importar'));
 select id into iid from public.frota_importacoes where fingerprint=p_fingerprint;
 if iid is not null then return jsonb_build_object('importados',0,'duplicados',jsonb_array_length(p_rows),'arquivo_repetido',true);end if;
 insert into public.frota_importacoes(arquivo,fingerprint,recebido,origem) values(left(p_arquivo,300),p_fingerprint,jsonb_array_length(p_rows),p_rows) returning id into iid;
 for r in select value from jsonb_array_elements(p_rows) loop
  select * into v from jsonb_populate_record(null::public.frota_registros,r);
  v.placa:=upper(regexp_replace(v.placa,'[^a-zA-Z0-9]','','g'));
  v.motorista:=upper(regexp_replace(trim(v.motorista),'\s+',' ','g'));
  v.partida:=coalesce(v.partida,'');v.rota:=coalesce(v.rota,'');v.observacao:=coalesce(v.observacao,'');
  v.chave:=md5(jsonb_build_array(v.data,v.operacao,v.placa,v.km_inicial,v.partida,v.rota)::text);
  select r0.* into existente from public.frota_registros r0 where r0.deleted_at is null
 and r0.data=v.data and r0.data_fim=v.data_fim and r0.operacao=v.operacao and r0.placa=v.placa and r0.motorista=v.motorista
 and r0.km_inicial is not distinct from v.km_inicial and r0.km_final is not distinct from v.km_final
 and r0.km_declarado is not distinct from v.km_declarado
 and r0.partida=v.partida and r0.rota=v.rota order by r0.id limit 1;
  if found then
   if existente.data_fim is distinct from v.data_fim or existente.motorista is distinct from v.motorista or existente.km_final is distinct from v.km_final or existente.km_declarado is distinct from v.km_declarado or existente.diesel is distinct from v.diesel or existente.litros is distinct from v.litros or existente.preco_litro is distinct from v.preco_litro or existente.pedagio is distinct from v.pedagio or existente.observacao is distinct from v.observacao then
    raise exception 'Registro existente com valores diferentes: % % . Edite o registro original.',v.data,v.placa;
   end if;
   duplicados:=duplicados+1;
  else
   insert into public.frota_registros(data,data_fim,operacao,placa,motorista,km_inicial,km_final,km_declarado,diesel,litros,preco_litro,pedagio,partida,rota,observacao,import_id,origem,chave)
   values(v.data,v.data_fim,v.operacao,v.placa,v.motorista,v.km_inicial,v.km_final,v.km_declarado,v.diesel,v.litros,v.preco_litro,v.pedagio,v.partida,v.rota,v.observacao,iid,coalesce(v.origem,'{}'),v.chave) returning id into rid;
   inseridos:=inseridos+1;
  end if;
 end loop;
 update public.frota_importacoes set importado=inseridos,duplicado=duplicados where id=iid;
 return jsonb_build_object('importados',inseridos,'duplicados',duplicados,'import_id',iid);
end $function$
