-- Restricted company modules. No anonymous access to stock, fines or source documents.
create table public.ct_membros(user_id uuid primary key references auth.users(id), perfil text not null check(perfil in ('leitor','gestor')),created_at timestamptz not null default now());
alter table public.ct_membros enable row level security;
revoke all on public.ct_membros from anon,authenticated;
grant select on public.ct_membros to authenticated;
create policy ct_membro_proprio on public.ct_membros for select to authenticated using(user_id=(select auth.uid()));
create table public.ct_registros(
 id bigint generated always as identity primary key,
 tipo text not null check(tipo in ('estoque','multa','confronto')),
 data date not null, chave text not null, dados jsonb not null,
 origem jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(tipo,chave),check(jsonb_typeof(dados)='object')
);
create index ct_registros_data on public.ct_registros(tipo,data);
alter table public.ct_registros enable row level security;
revoke all on public.ct_registros from anon,authenticated;
grant select,insert on public.ct_registros to authenticated;
grant usage,select on sequence public.ct_registros_id_seq to authenticated;
create policy ct_leitura on public.ct_registros for select to authenticated using(exists(select 1 from public.ct_membros where user_id=(select auth.uid())));
create policy ct_insercao on public.ct_registros for insert to authenticated with check(exists(select 1 from public.ct_membros where user_id=(select auth.uid()) and perfil='gestor'));
create function public.ct_validar_registro() returns trigger language plpgsql security invoker set search_path='' as $$
declare j jsonb:=new.dados; k text; v numeric;
begin
 new.data:=(j->>'data')::date;
 if new.tipo='estoque' then
  if j->>'estoque' not in ('Serbom','Premier','Premier Brasília') or coalesce(j->>'sku','')='' or coalesce(j->>'produto','')='' or coalesce(j->>'unidade','')='' or j->>'quantidade' is null then raise exception 'Estoque, SKU, produto, unidade e quantidade obrigatórios.';end if;
  v:=(j->>'quantidade')::numeric;
  foreach k in array array['reservado','disponivel_informado','valor_estoque','peso_liquido','peso_bruto','base_confronto'] loop v:=(j->>k)::numeric;end loop;
  foreach k in array array['minimo','maximo','consumo','custo'] loop v:=(j->>k)::numeric;if v<0 then raise exception 'Parâmetro negativo: %',k;end if;end loop;
  if (j->>'minimo')::numeric>(j->>'maximo')::numeric then raise exception 'Máximo menor que mínimo.';end if;
  perform (j->>'validade')::date;perform (j->>'expedicao')::date;
  new.chave:=jsonb_build_array(j->>'data',j->>'estoque',j->>'sistema',j->>'sku',j->>'unidade',j->>'lote',coalesce(j->>'linha_ref',''))::text;
 elsif new.tipo='multa' then
  if coalesce(j->>'auto','')='' or coalesce(j->>'orgao','')='' or coalesce(j->>'placa','')!~'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or coalesce(j->>'descricao','')='' or j->>'valor' is null or coalesce(j->>'status','') not in ('Pendente','Paga','Em recurso','Cancelada') then raise exception 'Dados da multa inválidos.';end if;
  if (j->>'valor')::numeric<0 or (j->>'pago')::numeric<0 then raise exception 'Valor negativo.';end if;
  if (j->>'pontos')::numeric<0 or (j->>'pontos')::numeric>99 or (j->>'pontos')::numeric<>trunc((j->>'pontos')::numeric) then raise exception 'Pontos inválidos.';end if;
  perform (j->>'vencimento')::date;perform (j->>'pagamento')::date;
  if j->>'status'='Paga' and (j->>'pago' is null or j->>'pagamento' is null) then raise exception 'Multa paga exige valor e data pagamento.';end if;
  new.chave:=jsonb_build_array(j->>'orgao',j->>'auto')::text;
 else
  if coalesce(j->>'sku','')='' or j->>'premier' is null or j->>'serbom' is null then raise exception 'Confronto inválido.';end if;
  perform (j->>'premier')::numeric;perform (j->>'serbom')::numeric;perform (j->>'diferenca')::numeric;
  new.chave:=jsonb_build_array(j->>'data',j->>'sku',j->>'unidade')::text;
 end if;
 return new;
end $$;
revoke execute on function public.ct_validar_registro() from public,anon,authenticated;
create trigger ct_validacao before insert on public.ct_registros for each row execute function public.ct_validar_registro();
create function public.ct_importar(p_tipo text,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; j jsonb; k text; previous jsonb; n int:=0; d int:=0;
begin
 if not exists(select 1 from public.ct_membros where user_id=(select auth.uid()) and perfil='gestor') then raise exception 'Acesso restrito a gestores autorizados.';end if;
 if p_tipo not in ('estoque','multa','confronto') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Importação inválida: de 1 a 10000 linhas.';end if;
 perform pg_advisory_xact_lock(hashtext('ct_importar'));
 for r in select value from jsonb_array_elements(p_rows) loop
  j:=r-'origem';
  if p_tipo='estoque' then k:=jsonb_build_array(j->>'data',j->>'estoque',j->>'sistema',j->>'sku',j->>'unidade',j->>'lote',coalesce(j->>'linha_ref',''))::text;
  elsif p_tipo='multa' then k:=jsonb_build_array(j->>'orgao',j->>'auto')::text;
  else k:=jsonb_build_array(j->>'data',j->>'sku',j->>'unidade')::text;end if;
  select dados into previous from public.ct_registros where tipo=p_tipo and chave=k;
  if found then
   if previous is distinct from j then raise exception 'Registro existente com valores diferentes. Original preservado: %',k;end if;d:=d+1;
  else insert into public.ct_registros(tipo,data,chave,dados,origem) values(p_tipo,(j->>'data')::date,k,j,coalesce(r->'origem','{}'));n:=n+1;end if;
 end loop;
 return jsonb_build_object('importados',n,'duplicados',d);
end $$;
revoke execute on function public.ct_importar(text,jsonb) from public;
grant execute on function public.ct_importar(text,jsonb) to authenticated;
-- Exact passage matching independent of filename and spreadsheet row, without updating old receipts.
create function public.ct_importar_pedagios(p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; result jsonb; n int:=0; d int:=0;
begin
 if not exists(select 1 from public.ct_membros where user_id=(select auth.uid()) and perfil='gestor') then raise exception 'Acesso restrito a gestores autorizados.';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Envie de 1 a 10000 passagens.';end if;
 perform pg_advisory_xact_lock(hashtext('frota_despesas'));
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'tipo'<>'pedagio' then raise exception 'Apenas pedágios.';end if;
  if exists(select 1 from public.frota_despesas e where e.deleted_at is null and e.tipo='pedagio' and e.data=(r->>'data')::date and e.placa=upper(regexp_replace(r->>'placa','[^a-zA-Z0-9]','','g')) and e.valor=(r->>'valor')::numeric and e.horario=coalesce(r->>'horario','') and e.praca=coalesce(r->>'praca','') and e.rodovia=coalesce(r->>'rodovia','') and e.sentido=coalesce(r->>'sentido','') and e.observacao=coalesce(r->>'observacao','')) then d:=d+1;
  else result:=public.frota_importar_despesas(jsonb_build_array(r));n:=n+(result->>'importados')::int;d:=d+(result->>'duplicados')::int;end if;
 end loop;
 return jsonb_build_object('importados',n,'duplicados',d);
end $$;
revoke execute on function public.ct_importar_pedagios(jsonb) from public;
grant execute on function public.ct_importar_pedagios(jsonb) to authenticated;
create table public.ct_fontes(
 id bigint generated always as identity primary key,
 arquivo text not null unique, tipo text not null check(tipo in ('estoque','confronto','modelo')),
 detalhes jsonb not null, created_at timestamptz not null default now()
);
alter table public.ct_fontes enable row level security;
revoke all on public.ct_fontes from anon,authenticated;
grant select,insert on public.ct_fontes to authenticated;
grant usage,select on sequence public.ct_fontes_id_seq to authenticated;
create policy ct_fontes_leitura on public.ct_fontes for select to authenticated using(exists(select 1 from public.ct_membros where user_id=(select auth.uid())));
create policy ct_fontes_insercao on public.ct_fontes for insert to authenticated with check(exists(select 1 from public.ct_membros where user_id=(select auth.uid()) and perfil='gestor'));
