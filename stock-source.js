(function(root){
 'use strict';
 const C=typeof module==='object'&&module.exports?require('./control-core.js'):root.PremierControlCore;
 const F=typeof module==='object'&&module.exports?require('./frota-core.js'):root.FrotaCore;
 const n=F.normalize,empty=F.missing;
 function context(filename,date,warehouse){
  const match=filename.match(/(\d{2})[.\-](\d{2})(?:[.\-](20\d{2}))?/);
  const d=date||(match?F.date((match[3]||'2026')+'-'+match[2]+'-'+match[1]):null);
  const w=warehouse||(/brasilia/i.test(n(filename))?'Premier Brasília':/serbom/i.test(filename)?'Serbom':/premier/i.test(filename)?'Premier':null);
  if(!d)throw Error('Informe a data da posição; o arquivo não possui data no nome.');return {date:d,warehouse:w};
 }
 function rawStock(wb,X,filename,date,warehouse){
  const ctx=context(filename,date,warehouse);if(!ctx.warehouse)throw Error('Selecione o estoque da planilha.');
  const sheet=wb.SheetNames[0],a=X.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true});
  const hi=a.findIndex(r=>r.some(v=>['CODIGO','COD.','COD'].includes(n(v)))&&r.some(v=>n(v)==='DESCRICAO'));if(hi<0)throw Error('Cabeçalho oficial do estoque não identificado.');
  const h=a[hi].map(n),code=h.findIndex(v=>['CODIGO','COD.','COD'].includes(v)),desc=h.indexOf('DESCRICAO'),premier=h.includes('ESTOQUE DISPONIVEL'),detail=h.includes('STATUS');
  const ix=k=>h.indexOf(k),get=(r,k)=>ix(k)<0?null:r[ix(k)],num=(r,k)=>empty(get(r,k))?null:C.signed(get(r,k));
  const items=[];
  for(let i=hi+1;i<a.length;i++){
   const r=a[i],sku=String(r[code]??'').trim();if(!sku||/^TOTAL|^CODIGO|^COD\.$/i.test(sku))continue;
   try{
    const origin={arquivo:filename,aba:sheet,linha:i+1,cabecalhos:a[hi],valores:r,colunas:Object.fromEntries(a[hi].map((v,j)=>[(premier||detail?'':String(a[hi-1]?.[j]||'')+' · ')+v+' [coluna '+(j+1)+']',r[j]??'']))};
    let o={data:ctx.date,estoque:ctx.warehouse,sku,produto:r[desc],linha_ref:String(i-hi),lote:'',unidade:'',quantidade:null,reservado:null,custo:null,origem:origin};
    if(premier){o.sistema='Premier';const filial=String(get(r,'FL')).replace(/^0+/,'');o.estoque={'1':'Premier','6':'Serbom','9':'Premier Brasília'}[filial];if(!o.estoque)throw Error('Filial não reconhecida: '+filial);o.unidade=get(r,'U.M.');o.quantidade=num(r,'SALDO EM ESTOQUE');o.reservado=num(r,'EMPENHO PARA REQ/PV/RESERVA');o.disponivel_informado=num(r,'ESTOQUE DISPONIVEL');o.valor_estoque=num(r,'VALOR EM ESTOQUE');o.base_confronto=o.disponivel_informado;o.observacao='Filial '+get(r,'FL')+' · '+get(r,'DESCRICAO DO ARMAZEM');}
    else if(detail){o.sistema='Serbom';o.unidade=get(r,'UN. EMB. 1');o.quantidade=num(r,'QTD EMB. 1');o.status=get(r,'STATUS');o.lote=get(r,'LOTE');o.validade=get(r,'VALIDADE');o.expedicao=get(r,'DATA LIMITE PARA EXPEDICAO');o.peso_liquido=num(r,'PESO LIQ. (KG)');o.peso_bruto=num(r,'PESO BRUTO (KG)');o.valor_estoque=num(r,'VALOR TOTAL');o.custo=num(r,'VALOR UNIT.');o.disponivel_informado=n(o.status)==='DISPONIVEL'?o.quantidade:0;o.base_confronto=n(o.status)==='DISPONIVEL'?o.peso_bruto:0;}
    else{o.sistema='Serbom';const groups=a[hi-1].map(n);const find=(group,label)=>h.findIndex((v,j)=>v===label&&groups[j]===group);const val=(group,label)=>{const j=find(group,label);return j<0?null:empty(r[j])?null:C.signed(r[j]);};o.unidade=get(r,'UN. EMB. 1');o.quantidade=val('FISICO NO CD','QTD EMB. 1');o.reservado=val('EMPENHADO','QTD EMB. 1');o.disponivel_informado=val('DISPONIVEL P/ NOVOS PEDIDOS','QTD EMB. 1');o.peso_liquido=val('FISICO NO CD','PESO LIQ. (KG)');o.peso_bruto=val('FISICO NO CD','PESO BRUTO (KG)');o.base_confronto=val('DISPONIVEL P/ NOVOS PEDIDOS','PESO BRUTO (KG)');o.observacao='Resumo oficial por código; grupos físicos, empenhados e bloqueados preservados nos dados de origem.';}
    const x=C.validate('estoque',o);x.origem=origin;items.push({record:x,line:i+1,selected:true});
   }catch(e){items.push({line:i+1,error:e.message,selected:false});}
  }
  if(!items.length)throw Error('Nenhum produto identificado.');return items;
 }
 function reconciliation(wb,X,filename,date){
  const ctx=context(filename,date);const sheet=wb.SheetNames.find(s=>n(s)==='CONFRONTO');if(!sheet)throw Error('Arquivo sem aba Confronto; os demais são referências de formato, não confrontos completos.');
  const a=X.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true}),hi=a.findIndex(r=>r.some(v=>n(v)==='PREMIER')&&r.some(v=>n(v).startsWith('SERBOM')));
  if(hi<0)throw Error('Cabeçalho do confronto não identificado.');const h=a[hi].map(n),index=k=>h.findIndex(v=>v===k),p=index('PREMIER'),s=h.findIndex(v=>v.startsWith('SERBOM')),diff=index('DIFERENCA'),status=index('SITUACAO');
  const method=a.slice(0,hi).flat().find(v=>typeof v==='string'&&/regra oficial/i.test(v))||(/25\.09/.test(filename)?'Valores do confronto Giba fornecido, preservados.':'Premier: disponível; Serbom: peso bruto disponível. Diferença = Serbom − Premier.');
  const items=[];let total=null;for(let i=hi+1;i<a.length;i++){const r=a[i];if(empty(r[0])||/^TOTAL$/i.test(String(r[0]))){if(!empty(r[p])&&!empty(r[s]))total={premier:r[p],serbom:r[s],diferenca:r[diff]};continue;}
   try{const x=C.validate('confronto',{data:ctx.date,sku:r[0],produto:r[1],unidade:r[2]||'',premier:r[p],serbom:r[s],diferenca:r[diff],situacao:status<0?'':r[status],metodo:method});x.origem={arquivo:filename,aba:sheet,linha:i+1,colunas:Object.fromEntries(a[hi].map((v,j)=>[v,r[j]??''])),total_informado:total};items.push({record:x,line:i+1,selected:true});}catch(e){items.push({line:i+1,error:e.message,selected:false});}
  }for(const item of items)if(item.record)item.record.origem.total_informado=total;return items;
 }
 function computed(rows,date){const get=w=>{const m=new Map();for(const r of rows.filter(r=>r.data===date&&r.sistema===w)){if(r.base_confronto===null)return null;const key=r.sku;if(!m.has(key))m.set(key,{value:0,produto:r.produto,unidade:r.unidade});m.get(key).value+=r.base_confronto;}return m;};const p=get('Premier'),s=get('Serbom');if(!p?.size||!s?.size)return [];return [...new Set([...p.keys(),...s.keys()])].sort().map(sku=>{const a=p.get(sku),b=s.get(sku),x={data:date,sku,produto:a?.produto||b.produto,unidade:a?.unidade||'KG',premier:a?.value??0,serbom:b?.value??0,metodo:'Calculado por código e mesma data: Premier disponível; Serbom peso bruto disponível.'};x.diferenca=x.serbom-x.premier;x.situacao=!a?'AUSENTE NA PREMIER':!b?'AUSENTE NA SERBOM':C.situation(x);return x;});}
 const api={context,rawStock,reconciliation,computed};if(typeof module==='object'&&module.exports)module.exports=api;else root.PremierStockSource=api;
})(typeof window!=='undefined'?window:globalThis);
