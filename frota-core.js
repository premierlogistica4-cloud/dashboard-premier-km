(function(root){
 'use strict';
 const OPS={SP:'Premier São Paulo',BSB:'Premier Brasília',FAZ:'Premier Fazenda'};
 const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
 const missing=v=>v==null||String(v).trim()===''||/^[.\s…—–-]+$/.test(String(v));
 function number(v,field='Número'){
  if(missing(v))return null;
  if(typeof v==='number'){if(!Number.isFinite(v)||v<0)throw Error(field+': valor inválido');return v;}
  let s=String(v).trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if(s.includes(',')){if(!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s))throw Error(field+': número inválido');s=s.replace(/\./g,'').replace(',','.');}
  else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  if(!/^\d+(\.\d+)?$/.test(s)||!Number.isFinite(+s))throw Error(field+': número inválido');
  return +s;
 }
 function date(v){
  if(v instanceof Date){if(isNaN(v))throw Error('Data inválida');return v.toISOString().slice(0,10);}
  if(typeof v==='number'){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.toISOString().slice(0,10);}
  const s=String(v??'').trim();let a=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/),y,m,d;
  if(a){[,y,m,d]=a;}else{a=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);if(!a)throw Error('Data inválida: '+s);[,d,m,y]=a;if(y.length===2)y='20'+y;}
  const out=[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
  const actual=new Date(out+'T00:00:00Z');if(isNaN(actual)||actual.toISOString().slice(0,10)!==out)throw Error('Data inválida: '+s);return out;
 }
 function period(v,end){
  const matches=typeof v==='string'?v.match(/\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})/g):null;
  let start,finish;
  if(matches?.length===2){start=date(matches[0]);finish=date(matches[1]);}
  else {start=date(v);finish=missing(end)?start:date(end);}
  if(finish<start)throw Error('Data final anterior à inicial');return [start,finish];
 }
 const aliases={
  DATA:'data','DATA INICIAL':'data','DATA FIM':'data_fim','DATA FINAL':'data_fim',OPERACAO:'operacao',MOTORISTA:'motorista',PLACA:'placa',
  'KM INICIAL':'km_inicial','KM FINAL':'km_final','KM TOTAL':'km_declarado','TOTAL KM':'km_declarado',
  'VALOR DIESEL':'diesel','VLR EM DIESEL':'diesel','VALOR EM DIESEL':'diesel','COMBUSTIVEL':'diesel',
  LITROS:'litros','PRECO/LITRO':'preco_litro','PRECO POR LITRO':'preco_litro',PEDAGIO:'pedagio',
  'PONTO DE PARTIDA':'partida',PARTIDA:'partida','DESTINO/ROTA':'rota',ROTA:'rota',DESTINO:'rota',OBSERVACAO:'observacao',DESCRICAO:'observacao'
 };
 const HEADERS=['DATA','DATA FIM','OPERAÇÃO','MOTORISTA','PLACA','KM INICIAL','KM FINAL','KM TOTAL','VALOR DIESEL','LITROS','PREÇO/LITRO','PEDÁGIO','PONTO DE PARTIDA','DESTINO/ROTA','OBSERVAÇÃO'];
 const fields=['data','data_fim','operacao','motorista','placa','km_inicial','km_final','km_declarado','diesel','litros','preco_litro','pedagio','partida','rota','observacao'];
 const identity=x=>JSON.stringify(['data','operacao','placa','km_inicial','partida','rota'].map(k=>x[k]??''));
 const payload=x=>Object.fromEntries(fields.map(k=>[k,x[k]??null]).concat([['origem',x.origem??{}]]));
 const equal=(a,b)=>['data_fim','motorista','km_final','km_declarado','diesel','litros','preco_litro','pedagio','observacao'].every(k=>(a[k]??null)===(b[k]??null));
 function operation(v,origin,description,defaultOp='SP'){
  const n=normalize(v),o=normalize(origin),d=normalize(description);
  if(n){if(n==='SP'||n==='PREMIER SAO PAULO'||n==='SAO PAULO')return 'SP';if(n==='BSB'||n==='PREMIER BRASILIA'||n==='BRASILIA')return 'BSB';if(n==='FAZ'||n==='PREMIER FAZENDA'||n==='FAZENDA')return 'FAZ';throw Error('Operação desconhecida: '+v);}
  if(d.includes('BRASILIA'))return 'BSB';if(o==='FAZENDA')return 'FAZ';if(o==='PREMIER')return defaultOp;throw Error('Informe a operação');
 }
 function validate(o,defaultOp='SP'){
  const [data,data_fim]=period(o.data,o.data_fim),warnings=[];
  const placa=normalize(o.placa).replace(/[^A-Z0-9]/g,''),motorista=String(o.motorista??'').trim().toUpperCase().replace(/\s+/g,' ');
  if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa))throw Error('Placa inválida');if(!motorista||motorista.length>200)throw Error('Informe o motorista');
  const x={data,data_fim,placa,motorista,operacao:operation(o.operacao,o.partida,o.observacao,defaultOp),partida:String(o.partida??'').trim(),rota:String(o.rota??'').trim(),observacao:String(o.observacao??'').trim(),origem:o.origem??{}};
  for(const k of ['km_inicial','km_final','km_declarado','diesel','litros','preco_litro','pedagio'])x[k]=number(o[k],k.replace(/_/g,' ').toUpperCase());
  if(x.km_inicial!==null&&x.km_final!==null&&x.km_final<x.km_inicial)throw Error('KM final menor que KM inicial');
  if(x.litros===0||x.preco_litro===0)throw Error('Litros e preço/litro devem ser positivos ou ficar vazios');
  x.km_total=x.km_inicial!==null&&x.km_final!==null?x.km_final-x.km_inicial:x.km_declarado;
  if(x.km_total===null)warnings.push('KM pendente: complete o hodômetro ou informe KM total');
  if(x.km_inicial===null||x.km_final===null)warnings.push('Hodômetro incompleto');
  if(x.km_total!==null&&x.km_declarado!==null&&Math.abs(x.km_total-x.km_declarado)>.001)warnings.push('Divergência de quilometragem: informado '+x.km_declarado+', calculado '+x.km_total);
  if(x.litros!==null&&x.preco_litro!==null&&x.diesel!==null&&Math.abs(x.litros*x.preco_litro-x.diesel)>.05)warnings.push('Valor diesel diferente de litros × preço/litro');
  if(missing(o.operacao))warnings.push('Operação mapeada para '+OPS[x.operacao]+'; confira na prévia');
  if(data!==data_fim)warnings.push('Viagem com intervalo: não será dividida em dias');
  return {record:x,warnings};
 }
 function parseWorkbook(wb,XLSX,existing=[],defaultOp='SP'){
  const result={rows:[],issues:[],sheets:[]};
  for(const name of wb.SheetNames){
   const matrix=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true});
   const hi=matrix.slice(0,50).findIndex(row=>row.some(v=>normalize(v)==='DATA')&&row.some(v=>normalize(v)==='PLACA')&&row.some(v=>normalize(v)==='MOTORISTA'));
   if(hi<0){result.issues.push('Aba '+name+': ignorada, sem cabeçalhos DATA, PLACA e MOTORISTA');continue;}
   const cols=matrix[hi].map(v=>aliases[normalize(v)]),used=cols.filter(Boolean);
   if(new Set(used).size!==used.length){result.issues.push('Aba '+name+': cabeçalhos duplicados; importação bloqueada');continue;}
   if(!used.includes('km_declarado')&&!(used.includes('km_inicial')&&used.includes('km_final'))){result.issues.push('Aba '+name+': faltam colunas de KM');continue;}
   result.sheets.push(name);
   for(let i=hi+1;i<matrix.length;i++){
    const row=matrix[i];if(!row.some(v=>!missing(v)))continue;
    if(row.some(v=>normalize(v)==='MOTORISTA')&&row.some(v=>normalize(v)==='PLACA'))continue;
    const item={line:i+1,sheet:name,raw:row,record:null,warnings:[],error:null,duplicate:false,conflict:false};
    const o={};cols.forEach((k,j)=>{if(k)o[k]=row[j];});
    if(missing(o.data)&&missing(o.placa)&&missing(o.motorista))continue;
    o.origem={aba:name,linha:i+1,valores:Object.fromEntries(cols.map((k,j)=>[k||'COL_'+j,row[j] instanceof Date?row[j].toISOString():row[j]]))};
    try{const v=validate(o,defaultOp);item.record=v.record;item.warnings=v.warnings;}catch(e){item.error=e.message;}
    result.rows.push(item);
   }
  }
  if(!result.sheets.length)throw Error('Não foi encontrada uma tabela compatível. '+result.issues.join('; '));
  classify(result.rows,existing);
  const usable=result.rows.filter(x=>x.record&&!x.error&&!x.duplicate).map(x=>x.record);
  const checks=alerts(usable,[...existing,...usable]);
  for(const item of result.rows){if(item.record){const key=identity(item.record);item.warnings=[...new Set([...item.warnings,...checks.filter(w=>identity(w.record)===key).map(w=>w.message)])];}}
  return result;
 }
 function classify(rows,existing){
  const seen=new Map(existing.map(x=>[identity(x),x]));
  for(const item of rows){item.duplicate=false;item.conflict=false;if(!item.record||item.error)continue;const key=identity(item.record),prev=seen.get(key);
   if(prev){if(equal(prev,item.record))item.duplicate=true;else {item.conflict=true;item.error='Mesma viagem com valores diferentes. Edite o registro original ou corrija a planilha.';}}
   else seen.set(key,item.record);
  }
 }
 const sum=(rows,k)=>rows.reduce((s,x)=>s+(Number(x[k])||0),0);
 const known=(rows,k)=>rows.some(x=>x[k]!==null&&x[k]!==undefined)?sum(rows,k):null;
 const ratio=(a,b)=>a!==null&&b>0?a/b:null;
 const days=x=>Math.round((new Date(x.data_fim||x.data)-new Date(x.data))/86400000)+1;
 const fuelLiters=x=>x.litros>0?x.litros:x.diesel>0&&x.preco_litro>0?x.diesel/x.preco_litro:null;
 const order=(a,b)=>a.data.localeCompare(b.data)||a.data_fim.localeCompare(b.data_fim)||(a.km_inicial??Infinity)-(b.km_inicial??Infinity)||(a.id??0)-(b.id??0);
 function filtered(rows,f={}){return rows.filter(x=>!x.deleted_at&&(!f.operation||x.operacao===f.operation)&&(!f.plate||x.placa===f.plate)&&(!f.driver||x.motorista===f.driver)&&(!f.start||x.data_fim>=f.start)&&(!f.end||x.data<=f.end));}
 function stats(rows){
  const km=sum(rows,'km_total'),fuel=known(rows,'diesel'),toll=known(rows,'pedagio'),cost=fuel===null&&toll===null?null:(fuel??0)+(toll??0),plates=new Set(rows.map(x=>x.placa)),drivers=new Set(rows.map(x=>x.motorista));
  const covered=rows.filter(x=>x.km_total>0);const liters=known(rows,'litros'),litersComplete=covered.length>0&&covered.every(x=>x.litros>0)&&rows.every(x=>!(x.litros>0)||x.km_total!==null);
  const priced=rows.filter(x=>fuelLiters(x)>0&&(x.diesel!==null||x.preco_litro>0));
  const consumptionComplete=covered.length>0&&covered.every(x=>fuelLiters(x)>0)&&rows.every(x=>!(fuelLiters(x)>0)||x.km_total!==null);
  const effectiveLiters=rows.reduce((n,x)=>n+(fuelLiters(x)||0),0),estimatedLiters=rows.some(x=>!(x.litros>0)&&fuelLiters(x)>0);
  return {km,fuel,toll,cost,plates:plates.size,drivers:drivers.size,cpkm:ratio(cost,km),fpkm:ratio(fuel,km),tpkm:ratio(toll,km),avgkm:ratio(km,plates.size),liters,kml:litersComplete?ratio(km,liters):null,consumption:consumptionComplete?ratio(km,effectiveLiters):null,estimatedLiters,effectiveLiters:effectiveLiters||null,price:ratio(priced.reduce((n,x)=>n+(x.diesel??(x.preco_litro*fuelLiters(x))),0),priced.reduce((n,x)=>n+fuelLiters(x),0)),fills:rows.filter(x=>x.diesel>0||x.litros>0).length,pending:rows.filter(x=>x.km_total===null).length,missingToll:rows.filter(x=>x.pedagio===null).length,missingFuel:rows.filter(x=>x.diesel===null).length,n:rows.length};
 }
 const MARKET_REFS=[{"start":"2026-09-20","end":"2026-09-26","place":"BRASILIA","type":"S500","price":7.05,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx"},{"start":"2026-09-20","end":"2026-09-26","place":"SAO PAULO","type":"S500","price":6.55,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx"},{"start":"2026-09-20","end":"2026-09-26","place":"BRASILIA","type":"S10","price":7.34,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx"},{"start":"2026-09-20","end":"2026-09-26","place":"SAO PAULO","type":"S10","price":7.08,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx"},{"start":"2026-09-20","end":"2026-09-26","place":"Brasil","type":"S500","price":6.85,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx"},{"start":"2026-09-20","end":"2026-09-26","place":"Brasil","type":"S10","price":7.33,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx"},{"start":"2026-09-27","end":"2026-10-03","place":"BRASILIA","type":"S500","price":7.19,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-27_2026-10-03.xlsx"},{"start":"2026-09-27","end":"2026-10-03","place":"SAO PAULO","type":"S500","price":6.64,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-27_2026-10-03.xlsx"},{"start":"2026-09-27","end":"2026-10-03","place":"BRASILIA","type":"S10","price":7.41,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-27_2026-10-03.xlsx"},{"start":"2026-09-27","end":"2026-10-03","place":"SAO PAULO","type":"S10","price":7.23,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-27_2026-10-03.xlsx"},{"start":"2026-09-27","end":"2026-10-03","place":"Brasil","type":"S500","price":6.9,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-27_2026-10-03.xlsx"},{"start":"2026-09-27","end":"2026-10-03","place":"Brasil","type":"S10","price":7.35,"source":"https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-09-27_2026-10-03.xlsx"}];
 function marketReference(x,type='S10'){
  const place=x.operacao==='SP'?'SAO PAULO':x.operacao==='BSB'?'BRASILIA':'Brasil';
  const eligible=MARKET_REFS.filter(r=>r.type===type&&r.place===place&&r.start<=x.data).sort((a,b)=>b.start.localeCompare(a.start));
  const ref=eligible[0];return ref?{...ref,fallback:x.data>ref.end,national:place==='Brasil'}:null;
 }
 function fuelBasis(x,type='S10'){
  if(x.litros>0)return {liters:x.litros,price:ratio(x.diesel,x.litros)??x.preco_litro,estimated:false,derived:false,source:'Litros informados',ref:null};
  if(x.diesel===0)return {liters:0,price:x.preco_litro??null,estimated:false,derived:false,source:'Sem gasto no registro',ref:null};
  return {liters:x.diesel>0&&x.preco_litro>0?x.diesel/x.preco_litro:null,price:x.preco_litro??null,estimated:false,derived:x.preco_litro>0,source:x.preco_litro>0?'Preço pago informado':'Informe litros ou preço pago/L',ref:null};
 }

 function analysis(rows,type='S10'){
  const s=stats(rows),basis=rows.map(x=>fuelBasis(x,type)),complete=rows.length>0&&rows.every((x,i)=>x.km_total!==null&&x.diesel!==null&&basis[i].liters!==null),liters=basis.reduce((n,b)=>n+(b.liters??0),0);
  const priced=rows.map((x,i)=>({x,b:basis[i]})).filter(({b})=>b.liters>0&&b.price>0);
  return {...s,consumption:complete?ratio(s.km,liters):null,effectiveLiters:liters||null,estimatedLiters:basis.some(b=>b.estimated&&b.liters>0),price:ratio(priced.reduce((n,{b})=>n+b.price*b.liters,0),priced.reduce((n,{b})=>n+b.liters,0)),litersPerKm:complete?ratio(liters,s.km):null,derivedLiters:basis.some(b=>b.derived),basis,marketFallback:basis.some(b=>b.ref?.fallback),missingBasis:basis.filter(b=>b.liters===null).length};
 }
 function estimate(rows,type='S10'){
  const bases=rows.map(x=>{const actual=fuelBasis(x,type),ref=marketReference(x,type);return actual.liters!==null?actual:{liters:x.diesel>0&&ref?x.diesel/ref.price:null,price:ref?.price??null,ref,estimated:true};});
  const complete=rows.length>0&&rows.every((x,i)=>x.km_total!==null&&x.diesel!==null&&bases[i].liters!==null),liters=bases.reduce((n,b)=>n+(b.liters??0),0),km=sum(rows,'km_total'),priced=bases.filter(b=>b.liters>0&&b.price>0);
  return {liters:complete&&liters>0?liters:null,kml:complete?ratio(km,liters):null,lpkm:complete?ratio(liters,km):null,price:ratio(priced.reduce((n,b)=>n+b.price*b.liters,0),priced.reduce((n,b)=>n+b.liters,0)),market:bases.some(b=>b.estimated),fallback:bases.some(b=>b.ref?.fallback),bases};
 }
 function groups(rows,key){const by=new Map();for(const x of rows){if(!by.has(x[key]))by.set(x[key],[]);by.get(x[key]).push(x);}return [...by].map(([name,a])=>({name,rows:a,stats:stats(a),last:a.slice().sort(order).at(-1)})).sort((a,b)=>a.name.localeCompare(b.name));}
 const median=values=>{const a=values.slice().sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length?a.length%2?a[i]:(a[i-1]+a[i])/2:null;};
 function alerts(rows,all=rows,settings={fator_custo:1.5,fator_km:3}){
  const out=[],ids=new Set(rows.map(x=>x.id??identity(x)));const push=(x,message)=>{if(ids.has(x.id??identity(x)))out.push({record:x,message});};
  for(const x of rows){if(x.km_total===null)push(x,'KM pendente');if(x.km_declarado!==null&&x.km_total!==null&&Math.abs(x.km_total-x.km_declarado)>.001)push(x,'Divergência entre KM informado e calculado');if(x.litros&&x.preco_litro&&x.diesel!==null&&Math.abs(x.litros*x.preco_litro-x.diesel)>.05)push(x,'Diesel diferente de litros × preço/litro');}
  for(const g of groups(all.filter(x=>!x.deleted_at),'placa')){const ordered=g.rows.slice().sort(order),rates=ordered.filter(x=>x.km_total>0).map(x=>x.km_total/days(x)),m=median(rates);
   ordered.forEach((x,i)=>{const p=ordered[i-1];if(p?.km_final!==null&&p?.km_final!==undefined&&x.km_inicial!==null&&Math.abs(p.km_final-x.km_inicial)>.001)push(x,'Hodômetro anterior '+p.km_final+' → inicial '+x.km_inicial);if(rates.length>=5&&m>0&&x.km_total/days(x)>m*settings.fator_km)push(x,'KM/dia acima de '+settings.fator_km+'× a mediana histórica da placa ('+m.toFixed(1)+' km/dia)');});
  }
  for(const g of groups(rows,'operacao')){const vehicles=groups(g.rows,'placa').filter(x=>x.stats.cpkm!==null),m=median(vehicles.map(x=>x.stats.cpkm));if(vehicles.length>=3&&m>0)for(const v of vehicles)if(v.stats.cpkm>m*settings.fator_custo)push(v.last,'Custo/KM da placa acima de '+settings.fator_custo+'× a mediana da operação');}
  return out;
 }
 function exportRows(rows){return rows.map(x=>Object.fromEntries(HEADERS.map((h,i)=>[h,x[fields[i]]??''])));}
 function expenseRows(records,expenses){
  const active=expenses.filter(x=>!x.deleted_at),out=records.filter(x=>!x.deleted_at).map(x=>{
   const e=active.filter(v=>v.registro_id===x.id),fuel=e.filter(v=>v.tipo==='diesel'),tolls=e.filter(v=>v.tipo==='pedagio'),meta=e.find(v=>v.periodo_inicio)||e[0];
   const row={...x,despesas:e,base_record:x,abastecimentos:fuel.length,passagens:tolls.length,litros_reais:fuel.length>0&&fuel.every(v=>v.litros>0),em_andamento:e.some(v=>v.em_andamento),viagem:meta?.viagem||'',periodo_fim_real:meta?.periodo_fim??x.data_fim};
   if(meta){row.operacao=meta.operacao;row.data=meta.periodo_inicio||x.data;row.data_fim=meta.periodo_fim||[x.data_fim,...e.map(v=>v.data)].sort().at(-1);}
   if(fuel.length){row.diesel=sum(fuel,'valor');row.litros=row.litros_reais?sum(fuel,'litros'):null;row.preco_litro=ratio(row.diesel,row.litros);}
   if(tolls.length)row.pedagio=sum(tolls,'valor');
   return row;
  });
  for(const e of active.filter(v=>v.registro_id===null||v.registro_id===undefined||!out.some(x=>x.id===v.registro_id))){out.push({id:'despesa-'+e.id,data:e.periodo_inicio||e.data,data_fim:e.periodo_fim||e.data,operacao:e.operacao||'PEND',placa:e.placa,motorista:'Não vinculado',km_total:null,km_inicial:null,km_final:null,km_declarado:null,diesel:e.tipo==='diesel'?e.valor:null,litros:e.tipo==='diesel'?e.litros:null,preco_litro:e.preco_litro,pedagio:e.tipo==='pedagio'?e.valor:null,observacao:e.observacao,viagem:e.viagem,em_andamento:e.em_andamento,despesas:[e],abastecimentos:e.tipo==='diesel'?1:0,passagens:e.tipo==='pedagio'?1:0,sem_vinculo:true,litros_reais:e.tipo==='diesel'&&e.litros>0});}
  return out;
 }
 function executiveStats(rows,type='S10'){
  const s=analysis(rows,type),e=estimate(rows,type),measured=rows.filter(x=>!x.em_andamento&&x.km_total>0&&x.litros>0&&x.diesel!==null),completed=rows.filter(x=>!x.em_andamento&&!x.sem_vinculo),mkm=sum(measured,'km_total'),ml=sum(measured,'litros');
  return {...s,estimate:e,measuredKml:ratio(mkm,ml),measuredLpkm:ratio(ml,mkm),measuredKm:mkm,measuredCount:measured.length,actualLiters:known(rows,'litros'),actualPrice:ratio(sum(rows.filter(x=>x.litros>0&&x.diesel!==null),'diesel'),sum(rows.filter(x=>x.litros>0&&x.diesel!==null),'litros')),ongoing:rows.filter(x=>x.em_andamento).length,completed:completed.length,fills:rows.reduce((n,x)=>n+(x.abastecimentos||((x.diesel>0||x.litros>0)?1:0)),0),passages:rows.reduce((n,x)=>n+(x.passagens||0),0),kmUnlinked:rows.filter(x=>x.sem_vinculo).length};
 }
 function comparisonPeriods(all,f={}){
  const current=filtered(all,f),start=f.start||current.map(x=>x.data).sort()[0],end=f.end||current.map(x=>x.data_fim).sort().at(-1);if(!start||!end)return null;
  const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),length=days({data:start,data_fim:end}),previousEnd=shift(start,-1),previousStart=shift(start,-length);
  const previous=filtered(all,{...f,start:previousStart,end:previousEnd});
  return {start,end,previousStart,previousEnd,current,previous,currentKm:sum(current,'km_total'),previousKm:previous.length?sum(previous,'km_total'):null,difference:previous.length?sum(current,'km_total')-sum(previous,'km_total'):null,percent:previous.length&&sum(previous,'km_total')>0?(sum(current,'km_total')/sum(previous,'km_total')-1)*100:null};
 }
 function evolution(rows){
  const dates=[...new Set(rows.filter(x=>x.km_total!==null).map(x=>x.data_fim))].sort(),total={SP:0,BSB:0,FAZ:0,PEND:0};
  return dates.map(date=>{const increment={SP:0,BSB:0,FAZ:0,PEND:0};for(const x of rows.filter(x=>x.data_fim===date)){increment[x.operacao]+=x.km_total||0;}for(const k of Object.keys(total))total[k]+=increment[k];return {date,increment,cumulative:{...total}};});
 }
 const EXPENSE_FIELDS=['registro_id','tipo','horario','tipo_veiculo','natureza','data','placa','operacao','viagem','periodo_inicio','periodo_fim','em_andamento','valor','litros','preco_litro','praca','rodovia','sentido','pagamento','categoria','observacao','origem'];
 function validateExpense(o){
  const x={registro_id:o.registro_id?Number(o.registro_id):null,tipo:o.tipo,data:date(o.data),placa:normalize(o.placa).replace(/[^A-Z0-9]/g,''),operacao:o.operacao==='PEND'?null:o.operacao,viagem:String(o.viagem||''),periodo_inicio:o.periodo_inicio?date(o.periodo_inicio):null,periodo_fim:o.periodo_fim?date(o.periodo_fim):null,em_andamento:o.em_andamento===true||o.em_andamento==='true',valor:number(o.valor,'Valor'),litros:o.tipo==='diesel'?number(o.litros,'Litros'):null,preco_litro:o.tipo==='diesel'?number(o.preco_litro,'Preço/L'):null,origem:o.origem||{}};
  if(!['diesel','pedagio'].includes(x.tipo)||(x.operacao!==null&&!OPS[x.operacao])||!x.data||!(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/).test(x.placa)||x.valor===null)throw Error('Informe tipo, data, placa, operação e valor válidos.');
  if(x.litros===0||x.preco_litro===0)throw Error('Litros e preço/L devem ser positivos ou vazios.');
  if(x.periodo_inicio&&x.periodo_fim&&x.periodo_fim<x.periodo_inicio)throw Error('Fim da viagem anterior ao início.');
  if(x.em_andamento&&x.periodo_fim)throw Error('Viagem em andamento deve ficar sem data final.');
  if(x.registro_id!==null&&!(Number.isSafeInteger(x.registro_id)&&x.registro_id>0))throw Error('Vínculo de viagem inválido.');
  for(const k of ['horario','tipo_veiculo','natureza','praca','rodovia','sentido','pagamento','categoria','observacao'])x[k]=String(o[k]||'');
  const warnings=[];if(x.litros&&x.preco_litro&&Math.abs(x.litros*x.preco_litro-x.valor)>.1)warnings.push('Valor ÷ litros ('+(x.valor/x.litros).toFixed(4)+') diverge do preço/L informado ('+x.preco_litro+').');if(!x.registro_id)warnings.push('Sem vínculo com viagem: custo incluído, KM/L indisponível.');return {record:x,warnings};
 }
 function parseExpenses(wb,X,tipo,defaultOp='SP'){
  const aliases={DATA:'data',DATAS:'data','DATA DE PASSAGEM':'data','DATA ABASTECIMENTO':'data',PLACA:'placa','PLACA VEICULO':'placa',VEICULO:'placa',HORARIO:'horario','TIPO DO VEICULO':'tipo_veiculo','DEBITO/CREDITO':'natureza',DESCRICAO:'observacao','VALOR(R$)':'valor',OPERACAO:'operacao',OPERACOES:'viagem',VIAGEM:'viagem',VALOR:'valor','VALOR TOTAL':'valor','CUSTO DO DIESEL':'valor','VALOR DIESEL':'valor','CUSTO':'valor','VALOR PEDAGIO':'valor',LITROS:'litros',LITRAGEM:'litros','QUANTIDADE LITROS':'litros','PRECO POR LITRO':'preco_litro','PRECO/LITRO':'preco_litro','PRECO/L':'preco_litro',PRACA:'praca','PRACA DE PEDAGIO':'praca',RODOVIA:'rodovia',SENTIDO:'sentido',PAGAMENTO:'pagamento','FORMA DE PAGAMENTO':'pagamento',CATEGORIA:'categoria',OBSERVACAO:'observacao','DATA INICIAL':'periodo_inicio','DATA FINAL':'periodo_fim','ID REGISTRO':'registro_id','EM ANDAMENTO':'em_andamento'};
  const rows=[],issues=[];for(const sheet of wb.SheetNames){const a=X.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true});const h=a.findIndex((r,i)=>i<50&&r.some(v=>aliases[normalize(v)]==='data')&&r.some(v=>aliases[normalize(v)]==='placa')&&r.some(v=>aliases[normalize(v)]==='valor'));if(h<0){if(a.some(r=>r.some(v=>!missing(v))))issues.push(sheet+': cabeçalho DATA, PLACA e VALOR não identificado.');continue;}const headers=a[h],mapped=headers.map(v=>aliases[normalize(v)]);if(mapped.filter(Boolean).length!==new Set(mapped.filter(Boolean)).size){issues.push(sheet+': colunas equivalentes duplicadas.');continue;}
   for(let i=h+1;i<a.length;i++){const raw=a[i];if(raw.every(missing))continue;const values={};headers.forEach((v,j)=>values[String(v)||'Coluna '+(j+1)]=raw[j]);const o={tipo,operacao:defaultOp,origem:{aba:sheet,linha:i+1,colunas:values}};mapped.forEach((k,j)=>{if(k)o[k]=raw[j];});if(o.operacao&&o.operacao!=='PEND'&&!OPS[o.operacao])o.operacao=operation(o.operacao,'','',defaultOp);if(o.em_andamento)o.em_andamento=['SIM','TRUE','1'].includes(normalize(o.em_andamento));try{const v=validateExpense(o);rows.push({sheet,line:i+1,record:v.record,warnings:v.warnings,error:null,selected:true});}catch(e){rows.push({sheet,line:i+1,record:null,warnings:[],error:e.message,selected:false});}}
  }return {rows,issues};
 }
 function driverSummary(rows){
  const linked=rows.filter(x=>!x.deleted_at&&!x.sem_vinculo&&x.motorista&&x.motorista!=='Não vinculado'),calendar=new Set();
  for(const x of linked){const start=Date.parse(x.data+'T00:00:00Z'),end=Date.parse(x.data_fim+'T00:00:00Z');for(let d=start;d<=end;d+=86400000)calendar.add(new Date(d).toISOString().slice(0,10));}
  const s=executiveStats(linked);return {...s,rows:linked,utilizations:linked.length,activeDays:calendar.size,kmPerDay:ratio(s.km,calendar.size),completed:linked.filter(x=>!x.em_andamento).length,ongoing:linked.filter(x=>x.em_andamento).length,litersCoverage:ratio(s.measuredKm,s.km),vehicles:[...new Set(linked.map(x=>x.placa))],operations:[...new Set(linked.map(x=>x.operacao))]};
 }
 const core={driverSummary,expenseRows,executiveStats,comparisonPeriods,evolution,validateExpense,parseExpenses,EXPENSE_FIELDS,estimate,MARKET_REFS,marketReference,fuelBasis,analysis,days,fuelLiters,OPS,HEADERS,fields,normalize,missing,number,date,period,validate,operation,parseWorkbook,classify,identity,payload,filtered,stats,groups,alerts,sum,known,ratio,order,exportRows};
 if(typeof module!=='undefined'&&module.exports)module.exports=core;else root.FrotaCore=core;
})(typeof window!=='undefined'?window:globalThis);
