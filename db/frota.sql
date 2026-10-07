-- Módulo aditivo: não altera km_registros.
create schema if not exists frota_private;
revoke all on schema frota_private from public, anon, authenticated;
create table public.frota_operacoes (codigo text primary key, nome text not null);
insert into public.frota_operacoes values ('SP','Premier São Paulo'),('BSB','Premier Brasília'),('FAZ','Premier Fazenda');
create table public.frota_importacoes (
 id bigint generated always as identity primary key, arquivo text not null,
 fingerprint text not null unique, recebido integer not null, importado integer not null default 0,
 duplicado integer not null default 0, origem jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.frota_registros (
 id bigint generated always as identity primary key,
 data date not null, data_fim date not null, operacao text not null references public.frota_operacoes(codigo),
 placa text not null, motorista text not null,
 km_inicial numeric(14,3), km_final numeric(14,3), km_declarado numeric(14,3),
 km_total numeric(14,3), diesel numeric(14,2), litros numeric(14,3), preco_litro numeric(14,4), pedagio numeric(14,2),
 partida text not null default '', rota text not null default '', observacao text not null default '',
 import_id bigint references public.frota_importacoes(id), origem jsonb not null default '{}',
 chave text not null, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint frota_intervalo check(data_fim>=data),
 constraint frota_hodometros check(km_inicial is null or km_final is null or km_final>=km_inicial),
 constraint frota_numeros check ((km_inicial is null or km_inicial>=0) and (km_final is null or km_final>=0) and
 (km_declarado is null or km_declarado>=0) and (diesel is null or diesel>=0) and
 (litros is null or litros>0) and (preco_litro is null or preco_litro>0) and (pedagio is null or pedagio>=0)),
 constraint frota_placa check(placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
 constraint frota_motorista check(length(trim(motorista)) between 1 and 200)
);
create unique index frota_registros_chave on public.frota_registros(chave) where deleted_at is null;
create index frota_registros_filtro on public.frota_registros(operacao,data,placa) where deleted_at is null;
create index frota_registros_import on public.frota_registros(import_id);
create table public.frota_config (
 id integer primary key check(id=1), fator_custo numeric not null default 1.5 check(fator_custo>1 and fator_custo<=10),
 fator_km numeric not null default 3 check(fator_km>1 and fator_km<=20), updated_at timestamptz not null default now()
);
insert into public.frota_config(id) values(1);
create table frota_private.audit_logs (
 id bigint generated always as identity primary key, registro_id bigint, acao text not null,
 antes jsonb, depois jsonb, ator text, created_at timestamptz not null default now()
);
alter table frota_private.audit_logs enable row level security;
create function public.frota_normalizar() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.placa:=upper(regexp_replace(new.placa,'[^a-zA-Z0-9]','','g'));
 new.motorista:=upper(regexp_replace(trim(new.motorista),'\s+',' ','g'));
 new.km_total:=case when new.km_final is not null and new.km_inicial is not null then new.km_final-new.km_inicial else new.km_declarado end;
 new.chave:=md5(jsonb_build_array(new.data,new.operacao,new.placa,new.km_inicial,new.partida,new.rota)::text);
 new.updated_at:=now();
 return new;
end $$;
create trigger frota_normalizar before insert or update on public.frota_registros for each row execute function public.frota_normalizar();
-- Definer apenas no schema privado: grava auditoria imutável por trigger, sem endpoint público.
create function frota_private.auditar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into frota_private.audit_logs(registro_id,acao,antes,depois,ator)
 values(new.id,case when tg_op='INSERT' then 'INSERT' when new.deleted_at is not null and old.deleted_at is null then 'SOFT_DELETE' else 'UPDATE' end,
 case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),current_setting('request.jwt.claims',true));
 return new;
end $$;
revoke all on function frota_private.auditar() from public,anon,authenticated;
create trigger frota_auditar after insert or update on public.frota_registros for each row execute function frota_private.auditar();

alter table public.frota_operacoes enable row level security;
alter table public.frota_registros enable row level security;
alter table public.frota_importacoes enable row level security;
alter table public.frota_config enable row level security;
revoke all on public.frota_operacoes,public.frota_registros,public.frota_importacoes,public.frota_config from anon,authenticated;
-- Mantém o modelo de colaboração já autorizado do site atual, sem login.
grant select on public.frota_operacoes to anon,authenticated;
grant select,insert,update on public.frota_registros,public.frota_importacoes to anon,authenticated;
grant select,update on public.frota_config to anon,authenticated;
grant usage,select on sequence public.frota_registros_id_seq,public.frota_importacoes_id_seq to anon,authenticated;
create policy frota_operacoes_leitura on public.frota_operacoes for select to anon,authenticated using(true);
create policy frota_registros_leitura on public.frota_registros for select to anon,authenticated using(true);
create policy frota_registros_insercao on public.frota_registros for insert to anon,authenticated with check(deleted_at is null);
create policy frota_registros_edicao on public.frota_registros for update to anon,authenticated using(true) with check(true);
create policy frota_importacoes_leitura on public.frota_importacoes for select to anon,authenticated using(true);
create policy frota_importacoes_insercao on public.frota_importacoes for insert to anon,authenticated with check(true);
create policy frota_importacoes_edicao on public.frota_importacoes for update to anon,authenticated using(true) with check(true);
create policy frota_config_leitura on public.frota_config for select to anon,authenticated using(true);
create policy frota_config_edicao on public.frota_config for update to anon,authenticated using(id=1) with check(id=1);

create function public.frota_importar(p_arquivo text,p_fingerprint text,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
  select * into existente from public.frota_registros where chave=v.chave and deleted_at is null;
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
end $$;
revoke execute on function public.frota_importar(text,text,jsonb) from public;
grant execute on function public.frota_importar(text,text,jsonb) to anon,authenticated;
revoke execute on function public.frota_normalizar() from public;

create view public.frota_caminhoes with(security_invoker=true) as select placa,max(data_fim) ultima_utilizacao,count(*) registros from public.frota_registros where deleted_at is null group by placa;
create view public.frota_motoristas with(security_invoker=true) as select motorista,max(data_fim) ultima_utilizacao,count(*) registros from public.frota_registros where deleted_at is null group by motorista;
create view public.frota_abastecimentos with(security_invoker=true) as select id,data,operacao,placa,motorista,diesel,litros,preco_litro,import_id from public.frota_registros where deleted_at is null and (diesel>0 or litros>0);
create view public.frota_pedagios with(security_invoker=true) as select id,data,operacao,placa,motorista,rota,pedagio,import_id from public.frota_registros where deleted_at is null and pedagio is not null;
grant select on public.frota_caminhoes,public.frota_motoristas,public.frota_abastecimentos,public.frota_pedagios to anon,authenticated;
