-- Narrow public intake requested for employees without login.
-- Only validated executive fields; no raw documents, arbitrary JSON, driver names, CPF or CNPJ.
-- Immutable entries: no UPDATE/DELETE grant. Existing official source tables remain untouched.
create table public.ct_lancamentos(
 id bigint generated always as identity primary key,
 tipo text not null check(tipo in ('estoque','multa','pedagio')),
 data date not null, chave text not null, dados jsonb not null,
 proveniencia jsonb not null default '{}', created_at timestamptz not null default now(),unique(tipo,chave)
);
alter table public.ct_lancamentos enable row level security;
revoke all on public.ct_lancamentos from anon,authenticated;
grant select,insert on public.ct_lancamentos to anon,authenticated;
grant usage,select on sequence public.ct_lancamentos_id_seq to anon,authenticated;
create policy ct_lancamentos_consulta on public.ct_lancamentos for select to anon,authenticated using(true);
create policy ct_lancamentos_novos on public.ct_lancamentos for insert to anon,authenticated with check(true);
create function public.ct_validar_lancamento() returns trigger language plpgsql security invoker set search_path='' as $$
declare j jsonb:=new.dados; k text; allowed text[]; v numeric;
begin
 if jsonb_typeof(j)<>'object' or octet_length(j::text)>16000 then raise exception 'Preencha somente os campos do formulário.';end if;
 allowed:=case new.tipo
 when 'estoque' then array['data','estoque','sistema','filial','sku','produto','unidade','quantidade','reservado','minimo','maximo','consumo','custo','lote','validade','linha_ref','disponivel_informado','valor_estoque','peso_liquido','peso_bruto','status','base_confronto','expedicao']
 when 'multa' then array['data','auto','orgao','horario','placa','codigo','descricao','local','valor','pago','status','vencimento','pagamento','pontos']
 else array['tipo','data','horario','placa','tipo_veiculo','valor','operacao','registro_id','praca','rodovia','sentido','pagamento','categoria','viagem','descricao'] end;
 for k in select jsonb_object_keys(j) loop
  if not k=any(allowed) or jsonb_typeof(j->k) in ('array','object') or length(j->>k)>2000 then raise exception 'Campo não permitido: %. Documentos e dados pessoais não entram nesta área pública.',k;end if;
 end loop;
 -- Require typed numeric JSON to prevent text concatenation in public analytics.
 foreach k in array case new.tipo when 'estoque' then array['quantidade','reservado','disponivel_informado','valor_estoque','peso_liquido','peso_bruto','base_confronto','minimo','maximo','consumo','custo'] when 'multa' then array['valor','pago','pontos'] else array['valor','registro_id'] end loop
  if j ? k and j->k<>'null'::jsonb and jsonb_typeof(j->k)<>'number' then raise exception 'Número inválido: %',k;end if;
 end loop;
 new.data:=(j->>'data')::date;
 if new.tipo='estoque' then
  if coalesce(j->>'estoque','') not in ('Premier','Serbom','Premier Brasília') or coalesce(j->>'sku','')='' or coalesce(j->>'produto','')='' or coalesce(j->>'unidade','')='' or j->>'quantidade' is null then raise exception 'Estoque, código, produto, unidade e quantidade obrigatórios.';end if;
  foreach k in array array['quantidade','reservado','disponivel_informado','valor_estoque','peso_liquido','peso_bruto','base_confronto','minimo','maximo','consumo','custo'] loop v:=(j->>k)::numeric;if v='NaN'::numeric or abs(v)>1000000000000 then raise exception 'Número inválido: %',k;end if;end loop;
  if (j->>'minimo')::numeric<0 or (j->>'maximo')::numeric<0 or (j->>'consumo')::numeric<0 or (j->>'custo')::numeric<0 or (j->>'maximo')::numeric<(j->>'minimo')::numeric then raise exception 'Parâmetros de estoque inválidos.';end if;
  perform (j->>'validade')::date;perform (j->>'expedicao')::date;
  new.chave:=jsonb_build_array(j->>'data',j->>'estoque',j->>'sistema',j->>'sku',j->>'unidade',j->>'lote',coalesce(j->>'linha_ref',''))::text;
 elsif new.tipo='multa' then
  if coalesce(j->>'auto','')='' or coalesce(j->>'orgao','')='' or coalesce(j->>'placa','')!~'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or coalesce(j->>'descricao','')='' or j->>'valor' is null or coalesce(j->>'status','') not in ('Pendente','Paga','Em recurso','Cancelada') then raise exception 'Auto, órgão, placa, descrição, valor e status válidos são obrigatórios.';end if;
  foreach k in array array['valor','pago','pontos'] loop v:=(j->>k)::numeric;if v<0 or v='NaN'::numeric or v>1000000000000 then raise exception 'Número inválido: %',k;end if;end loop;
  if (j->>'pontos')::numeric>99 or (j->>'pontos')::numeric<>trunc((j->>'pontos')::numeric) then raise exception 'Pontos inválidos.';end if;
  perform (j->>'vencimento')::date;perform (j->>'pagamento')::date;
  if j->>'status'='Paga' and (j->>'pago' is null or j->>'pagamento' is null) then raise exception 'Informe valor e data do pagamento.';end if;
  new.chave:=jsonb_build_array(j->>'orgao',j->>'auto')::text;
 else
  if coalesce(j->>'placa','')!~'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or j->>'valor' is null or (j->>'valor')::numeric<0 or (j->>'valor')::numeric>10000000 then raise exception 'Data, placa e valor válidos são obrigatórios.';end if;
  if coalesce(j->>'horario','')<>'' and j->>'horario'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then raise exception 'Horário inválido.';end if;
  if j->>'operacao' is not null and j->>'operacao' not in ('SP','BSB','FAZ') then raise exception 'Operação inválida.';end if;
  if j->>'registro_id' is not null and not exists(select 1 from public.frota_registros r where r.id=(j->>'registro_id')::bigint and r.placa=j->>'placa' and r.deleted_at is null and r.data<=new.data and coalesce(r.data_fim,r.data)>=new.data and (j->>'operacao' is null or j->>'operacao'=r.operacao)) then raise exception 'Viagem não corresponde à placa, data e operação.';end if;
  new.chave:=jsonb_build_array(j->>'data',j->>'horario',j->>'placa',j->>'valor',j->>'praca',j->>'rodovia',j->>'sentido',j->>'descricao')::text;
 end if;
 -- Provenance is limited to file identification. No arbitrary source columns can be submitted.
 if new.proveniencia ? 'linha' and new.proveniencia->'linha'<>'null'::jsonb and (jsonb_typeof(new.proveniencia->'linha')<>'number' or (new.proveniencia->>'linha')::numeric<>trunc((new.proveniencia->>'linha')::numeric) or (new.proveniencia->>'linha')::numeric<1 or (new.proveniencia->>'linha')::numeric>1000000) then raise exception 'Linha de origem inválida.';end if;
 new.proveniencia:=jsonb_strip_nulls(jsonb_build_object('arquivo',left(new.proveniencia->>'arquivo',250),'aba',left(new.proveniencia->>'aba',100),'linha',new.proveniencia->'linha'));
 return new;
end $$;
revoke execute on function public.ct_validar_lancamento() from public,anon,authenticated;
create trigger ct_lancamentos_validacao before insert on public.ct_lancamentos for each row execute function public.ct_validar_lancamento();
create function public.ct_importar_lancamentos(p_tipo text,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; j jsonb; k text; prev jsonb; n int:=0; d int:=0;
begin
 if p_tipo not in ('estoque','multa','pedagio') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Envie de 1 a 10000 linhas do layout.';end if;
 perform pg_advisory_xact_lock(hashtext('ct_lancamentos'));
 for r in select value from jsonb_array_elements(p_rows) loop
  j:=r->'dados';
  if p_tipo='estoque' then k:=jsonb_build_array(j->>'data',j->>'estoque',j->>'sistema',j->>'sku',j->>'unidade',j->>'lote',coalesce(j->>'linha_ref',''))::text;
  elsif p_tipo='multa' then k:=jsonb_build_array(j->>'orgao',j->>'auto')::text;
  else k:=jsonb_build_array(j->>'data',j->>'horario',j->>'placa',j->>'valor',j->>'praca',j->>'rodovia',j->>'sentido',j->>'descricao')::text;end if;
  if p_tipo in ('estoque','multa') then select resumo into prev from public.ct_registros where tipo=p_tipo and chave=k;else prev:=null;end if;
  if prev is null then select dados into prev from public.ct_lancamentos where tipo=p_tipo and chave=k;end if;
  if prev is not null then
   if prev is distinct from j then raise exception 'Registro existente com informações diferentes. Original mantido: %',k;end if;d:=d+1;
  elsif p_tipo='pedagio' and exists(select 1 from public.frota_despesas e where e.tipo='pedagio' and e.deleted_at is null and e.data=(j->>'data')::date and e.placa=j->>'placa' and e.valor=(j->>'valor')::numeric and e.horario=coalesce(j->>'horario','') and e.praca=coalesce(j->>'praca','') and e.rodovia=coalesce(j->>'rodovia','') and e.sentido=coalesce(j->>'sentido','') and e.observacao=coalesce(j->>'descricao','')) then d:=d+1;
  else insert into public.ct_lancamentos(tipo,data,chave,dados,proveniencia) values(p_tipo,(j->>'data')::date,k,j,coalesce(r->'proveniencia','{}'));n:=n+1;end if;
 end loop;
 return jsonb_build_object('importados',n,'duplicados',d);
end $$;
revoke execute on function public.ct_importar_lancamentos(text,jsonb) from public;
grant execute on function public.ct_importar_lancamentos(text,jsonb) to anon,authenticated;
