(function(root){
 'use strict';
 const F=typeof module==='object'&&module.exports?require('./frota-core.js'):root.FrotaCore;
 const norm=F.normalize, warehouses=['Serbom','Premier','Premier Brasília'];
 const definitions={
  estoque:[['data','DATA'],['estoque','ESTOQUE'],['sku','SKU'],['produto','PRODUTO'],['unidade','UNIDADE'],['quantidade','QUANTIDADE'],['reservado','RESERVADO'],['minimo','MÍNIMO'],['maximo','MÁXIMO'],['consumo','CONSUMO MÉDIO/DIA'],['custo','CUSTO UNITÁRIO'],['lote','LOTE'],['validade','VALIDADE'],['observacao','OBSERVAÇÃO'],['sistema','SISTEMA ORIGEM'],['filial','FILIAL'],['linha_ref','REFERÊNCIA LINHA'],['disponivel_informado','DISPONÍVEL INFORMADO'],['valor_estoque','VALOR EM ESTOQUE'],['peso_liquido','PESO LÍQUIDO KG'],['peso_bruto','PESO BRUTO KG'],['status','STATUS ESTOQUE'],['base_confronto','BASE CONFRONTO'],['expedicao','LIMITE EXPEDIÇÃO']],
  multa:[['auto','AUTO DE INFRAÇÃO'],['orgao','ÓRGÃO AUTUADOR'],['data','DATA'],['horario','HORÁRIO'],['placa','PLACA'],['motorista','MOTORISTA'],['codigo','CÓDIGO INFRAÇÃO'],['descricao','DESCRIÇÃO'],['local','LOCAL'],['valor','VALOR'],['pago','VALOR PAGO'],['status','STATUS'],['vencimento','VENCIMENTO'],['pagamento','DATA PAGAMENTO'],['pontos','PONTOS INFORMADOS'],['observacao','OBSERVAÇÃO']],
  confronto:[['data','DATA'],['sku','CÓDIGO'],['produto','DESCRIÇÃO'],['unidade','UNIDADE'],['premier','PREMIER'],['serbom','SERBOM'],['diferenca','DIFERENÇA'],['situacao','SITUAÇÃO'],['metodo','MÉTODO']],
  pedagio:[['data','DATA'],['horario','HORÁRIO'],['placa','PLACA'],['tipo_veiculo','TIPO DO VEÍCULO'],['observacao','DESCRIÇÃO'],['valor','VALOR'],['operacao','OPERAÇÃO'],['registro_id','ID REGISTRO'],['praca','PRAÇA'],['rodovia','RODOVIA'],['sentido','SENTIDO'],['pagamento','PAGAMENTO'],['categoria','CATEGORIA'],['viagem','VIAGEM']]
 };
 const text=v=>String(v??'').trim();
 const optionalDate=v=>F.missing(v)?null:F.date(v);
 const numeric=(v,k,required=false)=>{const n=F.number(v,k);if(required&&n===null)throw Error(k+': obrigatório');return n;};
 function time(v){if(v instanceof Date)return v.toISOString().slice(11,19);if(typeof v==='number'&&v>=0&&v<1){const s=Math.round(v*86400)%86400;return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');}const s=text(v);return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)?s+':00':s;}
 function validate(kind,o){
  if(kind==='pedagio'){
   let op=text(o.operacao);if(op){op=Object.keys(F.OPS).find(k=>k===norm(op)||norm(F.OPS[k])===norm(op));if(!op)throw Error('Operação inválida; use Premier São Paulo, Premier Brasília ou Premier Fazenda.');}else op=null;
   const v=F.validateExpense({...o,horario:time(o.horario),tipo:'pedagio',operacao:op});
   if(v.record.horario&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v.record.horario))throw Error('Horário deve ser HH:MM ou HH:MM:SS.');
   return v.record;
  }
  if(kind==='confronto'){const x=Object.fromEntries(definitions[kind].map(([k])=>[k,text(o[k])]));x.data=F.date(o.data);x.sku=norm(o.sku);if(!x.sku)throw Error('Código obrigatório.');for(const k of ['premier','serbom']){if(F.missing(o[k]))throw Error(k+': obrigatório');x[k]=signed(o[k]);}x.diferenca=F.missing(o.diferenca)?x.serbom-x.premier:signed(o.diferenca);x.situacao=text(o.situacao)||situation(x);return x;}
  const x=Object.fromEntries(definitions[kind].map(([k])=>[k,text(o[k])]));x.data=F.date(o.data);
  if(kind==='estoque'){
   x.estoque=warehouses.find(w=>norm(w)===norm(o.estoque));if(!x.estoque)throw Error('Estoque: use Serbom, Premier ou Premier Brasília.');
   x.sistema=text(o.sistema)||'Planilha';x.filial={'Premier':'1','Serbom':'6','Premier Brasília':'9'}[x.estoque];x.sku=norm(o.sku);x.unidade=norm(o.unidade);x.lote=norm(o.lote);
   if(!x.sku||!x.produto||!x.unidade)throw Error('SKU, produto e unidade são obrigatórios.');
   for(const k of ['quantidade','reservado'])x[k]=F.missing(o[k])?null:signed(o[k]);if(x.quantidade===null)throw Error('Quantidade obrigatória.');for(const k of ['minimo','maximo','consumo','custo'])x[k]=numeric(o[k],k);

   if(x.minimo!==null&&x.maximo!==null&&x.maximo<x.minimo)throw Error('Máximo menor que o mínimo.');
   x.validade=optionalDate(o.validade);x.expedicao=optionalDate(o.expedicao);for(const k of ['disponivel_informado','valor_estoque','peso_liquido','peso_bruto','base_confronto'])x[k]=F.missing(o[k])?null:signed(o[k]);
   if(x.base_confronto===null){
    if(x.sistema==='Premier')x.base_confronto=x.disponivel_informado??(x.reservado!==null?x.quantidade-x.reservado:null);
    else if(x.sistema==='Serbom'&&x.status)x.base_confronto=norm(x.status)==='DISPONIVEL'?x.peso_bruto:0;
   }
  }else{
   x.horario=time(o.horario);if(x.horario&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(x.horario))throw Error('Horário inválido.');x.auto=norm(o.auto);x.orgao=norm(o.orgao);x.placa=norm(o.placa).replace(/[^A-Z0-9]/g,'');
   if(!x.auto||!x.orgao||!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(x.placa)||!x.descricao)throw Error('Auto, órgão, placa e descrição são obrigatórios.');
   x.valor=numeric(o.valor,'Valor',true);x.pago=numeric(o.pago,'Valor pago');x.pontos=numeric(o.pontos,'Pontos');
   if(x.pontos!==null&&(!Number.isInteger(x.pontos)||x.pontos>99))throw Error('Pontos informados devem ser inteiros entre 0 e 99.');
   const statuses=['Pendente','Paga','Em recurso','Cancelada'];x.status=statuses.find(s=>norm(s)===norm(o.status));if(!x.status)throw Error('Status: Pendente, Paga, Em recurso ou Cancelada.');
   x.vencimento=optionalDate(o.vencimento);x.pagamento=optionalDate(o.pagamento);
   if(x.status==='Paga'&&(x.pago===null||!x.pagamento))throw Error('Multa paga exige valor pago e data pagamento.');
   if(x.pagamento&&x.pagamento<x.data)throw Error('Pagamento anterior à infração.');
  }
  return x;
 }
 function signed(v){if(typeof v==='number'&&Number.isFinite(v))return v;const s=text(v);return s.startsWith('-')?-F.number(s.slice(1)):F.number(s);}
 function situation(x){return Math.abs(x.serbom-x.premier)<.000001?'IGUAL':x.serbom>x.premier?'POSITIVA':'NEGATIVA';}
 function identity(kind,x){return JSON.stringify(kind==='estoque'?[x.data,x.estoque,x.sistema,x.sku,x.unidade,x.lote,x.linha_ref||'']:kind==='confronto'?[x.data,x.sku,x.unidade]:kind==='multa'?[x.orgao,x.auto]:[x.data,x.horario,x.placa,x.valor,x.praca,x.rodovia,x.sentido,x.observacao]);}
 function equivalent(kind,a,b){return definitions[kind].filter(([k])=>kind==='pedagio'||!['motorista','observacao'].includes(k)).every(([k])=>JSON.stringify(a[k]??'')===JSON.stringify(b[k]??''));}
 function stockContent(x){return JSON.stringify(definitions.estoque.filter(([k])=>!['linha_ref','observacao'].includes(k)).map(([k])=>x[k]??''));}
 function comparisonStats(rows){const above=rows.filter(x=>x.diferenca>.00001).length,below=rows.filter(x=>x.diferenca<-.00001).length,equal=rows.length-above-below;return {total:rows.length,above,below,equal,different:above+below,percentage:rows.length?(above+below)/rows.length*100:null,mismatch:rows.filter(x=>Math.abs(x.serbom-x.premier-x.diferenca)>.00001).length};}
 function classify(kind,items,existing){const seen=new Map(existing.map(x=>[identity(kind,x),x])),contents=new Set(kind==='estoque'?existing.map(stockContent):[]);for(const i of items){i.duplicate=false;i.conflict=false;if(!i.record||i.error)continue;const key=identity(kind,i.record),old=seen.get(key);if(kind==='estoque'&&contents.has(stockContent(i.record))){i.duplicate=true;i.selected=false;}else if(old){if(equivalent(kind,old,i.record)){i.duplicate=true;i.selected=false;}else{i.conflict=true;i.error='Registro já identificado com dados diferentes. Original preservado; revise antes de importar.';i.selected=false;}}else{seen.set(key,i.record);if(kind==='estoque')contents.add(stockContent(i.record));i.selected=true;}}return items;}
 function parse(kind,wb,X,existing=[]){
  const name=kind==='estoque'?'ESTOQUES':kind==='multa'?'MULTAS':'PEDÁGIOS',sheet=wb.SheetNames.find(s=>norm(s)===norm(name))||wb.SheetNames[0];
  const matrix=X.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true});if(!matrix.length)throw Error('Planilha vazia.');
  const aliases=Object.fromEntries(definitions[kind].map(([k,h])=>[norm(h),k])),header=matrix[0].map(h=>aliases[norm(h)]);
  const required=kind==='estoque'?['data','estoque','sku','produto','unidade','quantidade']:kind==='multa'?['auto','orgao','data','placa','descricao','valor','status']:['data','placa','valor'];
  if(required.some(k=>!header.includes(k)))throw Error('Cabeçalho diferente do layout. Baixe o modelo e preencha as colunas obrigatórias.');
  if(header.filter(Boolean).length!==new Set(header.filter(Boolean)).size)throw Error('Cabeçalhos duplicados.');
  const items=[];for(let i=1;i<matrix.length;i++){const row=matrix[i];if(row.every(F.missing))continue;const o={};header.forEach((k,j)=>{if(k)o[k]=row[j];});try{const record=validate(kind,o);record.origem={aba:sheet,linha:i+1,colunas:Object.fromEntries(matrix[0].map((h,j)=>[String(h),row[j]??'']))};items.push({record,line:i+1,selected:true});}catch(e){items.push({line:i+1,error:e.message,selected:false});}}
  if(items.length>10000)throw Error('Limite de 10.000 linhas por importação.');return classify(kind,items,existing);
 }
 function snapshots(all,cutoff='9999-12-31'){const dates={};for(const r of all){const k=r.estoque+'|'+(r.sistema||'Planilha');if(r.data<=cutoff&&(!dates[k]||r.data>dates[k]))dates[k]=r.data;}return {dates,rows:all.filter(r=>r.data===dates[r.estoque+'|'+(r.sistema||'Planilha')])};}
 function products(rows){const m=new Map();for(const r of rows){const key=JSON.stringify([r.estoque,r.sistema,r.sku,r.unidade]);if(!m.has(key))m.set(key,{estoque:r.estoque,sistema:r.sistema,sku:r.sku,produto:r.produto,unidade:r.unidade,data:r.data,rows:[],quantidade:0,reservado:0,reservedKnown:true,value:0,costKnown:true});const p=m.get(key);p.rows.push(r);p.quantidade+=r.quantidade;p.reservado+=r.reservado??0;p.reservedKnown&&=r.reservado!=null;p.costKnown&&=r.custo!=null;p.value+=r.quantidade*(r.custo??0);}
  return [...m.values()].map(p=>{p.disponivel=p.rows.every(r=>r.disponivel_informado!=null)?p.rows.reduce((n,r)=>n+r.disponivel_informado,0):p.reservedKnown?p.quantidade-p.reservado:null;p.value=p.rows.reduce((n,r)=>n+(r.valor_estoque??r.quantidade*(r.custo??0)),0);p.costKnown=p.rows.every(r=>r.valor_estoque!=null||r.custo!=null);for(const k of ['minimo','maximo','consumo']){const a=[...new Set(p.rows.map(r=>r[k]))];p[k]=a.length===1?(a[0]??null):null;}p.coverage=p.disponivel!==null&&p.consumo>0?p.disponivel/p.consumo:null;return p;});
 }
 function premierERP(rows){const a=products(rows.filter(x=>x.sistema==='Premier'));if(!a.length)return null;const units=[...new Set(a.map(x=>x.unidade))].map(unit=>{const p=a.filter(x=>x.unidade===unit);return {unit,quantity:p.reduce((n,x)=>n+x.quantidade,0),available:p.every(x=>x.disponivel!==null)?p.reduce((n,x)=>n+x.disponivel,0):null};});return {positions:a.length,warehouses:[...new Set(a.map(x=>x.estoque))],dates:[...new Set(a.map(x=>x.data))].sort(),units,value:a.filter(x=>x.costKnown).reduce((n,x)=>n+x.value,0),valued:a.filter(x=>x.costKnown).length};}
 function stockExecutive(rows){const groups=new Map();for(const p of products(rows)){const key=JSON.stringify([p.estoque,p.sistema]);if(!groups.has(key))groups.set(key,{estoque:p.estoque,sistema:p.sistema,dates:new Set(),products:0,positive:0,zero:0,negative:0,unknown:0,belowMinimum:0,shortCoverage:0,value:0,valued:0});const g=groups.get(key);g.dates.add(p.data);g.products++;g[p.disponivel===null?'unknown':p.disponivel<0?'negative':p.disponivel===0?'zero':'positive']++;if(p.disponivel!==null&&p.minimo!==null&&p.disponivel<p.minimo)g.belowMinimum++;if(p.coverage!==null&&p.coverage<7)g.shortCoverage++;if(p.costKnown){g.value+=p.value;g.valued++;}}return [...groups.values()].map(g=>({...g,dates:[...g.dates].sort()}));}
 function reconciliationExecutive(rows){const stats=comparisonStats(rows),kg=rows.filter(x=>x.unidade==='KG'),absoluteKg=kg.reduce((n,x)=>n+Math.abs(x.diferenca),0),priorities=kg.filter(x=>Math.abs(x.diferenca)>.00001).slice().sort((a,b)=>Math.abs(b.diferenca)-Math.abs(a.diferenca)).slice(0,3);return {stats,kgLines:kg.length,absoluteKg,priorities,topShare:absoluteKg?priorities.reduce((n,x)=>n+Math.abs(x.diferenca),0)/absoluteKg*100:null};}
 function recommendations(rows,today){const result=[];for(const p of products(rows)){const base=p.estoque+' / '+p.sistema+' · '+p.sku+' ('+p.unidade+')';if(p.disponivel!==null&&p.disponivel<=0)result.push(base+': saldo disponível zero ou negativo; revisar reposição e pedidos reservados.');if(p.disponivel!==null&&p.minimo!==null&&p.disponivel<p.minimo)result.push(base+': repor '+(p.minimo-p.disponivel).toLocaleString('pt-BR')+' '+p.unidade+' para atingir o mínimo informado.');if(p.disponivel!==null&&p.maximo!==null&&p.disponivel>p.maximo)result.push(base+': excedente de '+(p.disponivel-p.maximo).toLocaleString('pt-BR')+' '+p.unidade+' acima do máximo; avaliar remanejamento.');if(p.coverage!==null&&p.coverage<7)result.push(base+': cobertura de '+p.coverage.toFixed(1)+' dias pelo consumo médio informado; revisar abastecimento.');for(const r of p.rows){if(r.expedicao&&r.quantidade>0){const days=Math.round((Date.parse(r.expedicao)-Date.parse(today))/86400000);if(days<=7)result.push(base+' · lote '+(r.lote||'não informado')+': '+(days<0?'limite de expedição ultrapassado há '+(-days)+' dias; revisar liberação.':'limite de expedição em '+days+' dias; priorizar planejamento.'));}if(r.validade&&r.quantidade>0){const days=Math.round((Date.parse(r.validade)-Date.parse(today))/86400000);if(days<=30)result.push(base+' · lote '+(r.lote||'não informado')+': '+(days<0?'validade vencida há '+(-days)+' dias; segregar e revisar.':'vence em '+days+' dias; priorizar pela validade (FEFO).'));}}}return result;}
 function formatTemplate(ws,def,X){for(let col=0;col<def.length;col++){if(['sku','auto','orgao','placa','lote','codigo','registro_id'].includes(def[col][0]))for(let row=1;row<=1000;row++){ws[X.utils.encode_cell({r:row,c:col})]={t:'s',v:'',z:'@'};}}ws['!ref']=X.utils.encode_range({s:{r:0,c:0},e:{r:1000,c:def.length-1}});ws['!autofilter']={ref:ws['!ref']};return ws;}
 const api={signed,situation,definitions,warehouses,validate,identity,equivalent,classify,parse,snapshots,products,recommendations,formatTemplate,comparisonStats,stockExecutive,reconciliationExecutive,premierERP};if(typeof module==='object'&&module.exports)module.exports=api;else root.PremierControlCore=api;
})(typeof window!=='undefined'?window:globalThis);
