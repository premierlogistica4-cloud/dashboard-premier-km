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
 const days=x=>Math.round((new Date(x.data_fim)-new Date(x.data))/86400000)+1;
 const order=(a,b)=>a.data.localeCompare(b.data)||a.data_fim.localeCompare(b.data_fim)||(a.km_inicial??Infinity)-(b.km_inicial??Infinity)||(a.id??0)-(b.id??0);
 function filtered(rows,f={}){return rows.filter(x=>!x.deleted_at&&(!f.operation||x.operacao===f.operation)&&(!f.plate||x.placa===f.plate)&&(!f.driver||x.motorista===f.driver)&&(!f.start||x.data_fim>=f.start)&&(!f.end||x.data<=f.end));}
 function stats(rows){
  const km=sum(rows,'km_total'),fuel=known(rows,'diesel'),toll=known(rows,'pedagio'),cost=fuel===null&&toll===null?null:(fuel??0)+(toll??0),plates=new Set(rows.map(x=>x.placa)),drivers=new Set(rows.map(x=>x.motorista));
  const covered=rows.filter(x=>x.km_total>0);const liters=known(rows,'litros'),litersComplete=covered.length>0&&covered.every(x=>x.litros>0)&&rows.every(x=>!(x.litros>0)||x.km_total!==null);
  const priced=rows.filter(x=>x.litros>0&&x.diesel!==null);
  return {km,fuel,toll,cost,plates:plates.size,drivers:drivers.size,cpkm:ratio(cost,km),fpkm:ratio(fuel,km),tpkm:ratio(toll,km),avgkm:ratio(km,plates.size),liters,kml:litersComplete?ratio(km,liters):null,price:ratio(sum(priced,'diesel'),sum(priced,'litros')),fills:rows.filter(x=>x.diesel>0||x.litros>0).length,pending:rows.filter(x=>x.km_total===null).length,missingToll:rows.filter(x=>x.pedagio===null).length,missingFuel:rows.filter(x=>x.diesel===null).length,n:rows.length};
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
 const core={OPS,HEADERS,fields,normalize,missing,number,date,period,validate,operation,parseWorkbook,classify,identity,payload,filtered,stats,groups,alerts,sum,known,ratio,order,exportRows};
 if(typeof module!=='undefined'&&module.exports)module.exports=core;else root.FrotaCore=core;
})(typeof window!=='undefined'?window:globalThis);
