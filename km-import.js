(function(root){
 'use strict';
 const plate=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const key=x=>JSON.stringify([x.data,plate(x.placa),Number(x.km_realizado),Number(x.volta_serbom),Number(x.google)]);
 function deduplicate(rows,existing){const seen=new Set(existing.map(key)),accepted=[];let duplicates=0;for(const row of rows){const normalized={...row,placa:plate(row.placa)},k=key(normalized);if(seen.has(k)){duplicates++;continue;}seen.add(k);accepted.push(normalized);}return {accepted,duplicates};}
 function parseRecords(rows){const F=typeof module==='object'&&module.exports?require('./frota-core.js'):root.FrotaCore,out=[];for(let i=0;i<rows.length;i++){const q=rows[i];if(Object.values(q).every(F.missing))continue;try{const o={},keys=new Set();for(const [k,v] of Object.entries(q)){const name=F.normalize(k);if(keys.has(name))throw Error('Cabeçalho duplicado: '+name);keys.add(name);o[name]=v;}const data=F.date(o.DATA),p=plate(o.PLACA);if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p))throw Error('Placa inválida');const r=F.number(o['KM REALIZADO'],'KM realizado'),g=F.number(o.GOOGLE??o['KM GOOGLE'],'KM Google'),v=F.number(o['VOLTA SERBOM'],'Volta Serbom')??0;if(r===null||g===null)throw Error('KM realizado e KM Google são obrigatórios; informe zero somente quando confirmado');const t=r+v;out.push({data,placa:p,km_realizado:r,volta_serbom:v,total_km:t,google:g,diferenca:t-g,percentual:g?(t-g)/g*100:0});}catch(e){throw Error('Linha '+(i+2)+': '+e.message);}}if(!out.length)throw Error('A planilha não contém registros de KM válidos.');return out;}
 if(typeof module==='object'&&module.exports){module.exports={deduplicate,parseRecords};return;}
 root.importX=async function(){try{
  const f=document.getElementById('file').files[0];if(!f)return alert('Selecione a planilha.');
  if(f.size>20*1024*1024)throw Error('Arquivo maior que 20 MB.');
  const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}),out=parseRecords(rows);
  const existing=[];for(let offset=0;;offset+=1000){const batch=await api('km_registros?select=data,placa,km_realizado,volta_serbom,google&limit=1000&offset='+offset);existing.push(...batch);if(batch.length<1000)break;}
  const result=deduplicate(out,existing),message=document.getElementById('imsg');
  if(!result.accepted.length){message.textContent=result.duplicates+' registros duplicados ignorados. Nenhum registro novo para importar.';return;}
  if(!confirm('Importar '+result.accepted.length+' registros novos para todos? '+result.duplicates+' duplicados serão ignorados.'))return;
  const inserted=await api('km_registros',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(result.accepted)}),count=inserted.length;
  message.textContent=count+' registros importados. '+(result.duplicates+result.accepted.length-count)+' duplicados ignorados.';await load();
 }catch(e){document.getElementById('imsg').textContent='Importação não concluída: '+e.message;}};
})(typeof window==='object'?window:globalThis);
