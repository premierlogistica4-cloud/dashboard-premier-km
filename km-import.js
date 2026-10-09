(function(root){
 'use strict';
 const plate=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const key=x=>JSON.stringify([x.data,plate(x.placa),Number(x.km_realizado),Number(x.volta_serbom),Number(x.google)]);
 function deduplicate(rows,existing){const seen=new Set(existing.map(key)),accepted=[];let duplicates=0;for(const row of rows){const normalized={...row,placa:plate(row.placa)},k=key(normalized);if(seen.has(k)){duplicates++;continue;}seen.add(k);accepted.push(normalized);}return {accepted,duplicates};}
 if(typeof module==='object'&&module.exports){module.exports={deduplicate};return;}
 root.importX=async function(){try{
  const f=document.getElementById('file').files[0];if(!f)return alert('Selecione a planilha.');
  const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}),out=[];
  for(const q of rows){const o=Object.fromEntries(Object.entries(q).map(([k,v])=>[norm(k),v])),dv=o.DATA,dt=dv instanceof Date?dv.toISOString().slice(0,10):String(dv).split('/').reverse().join('-'),p=plate(o.PLACA),r=+o['KM REALIZADO']||0,v=+o['VOLTA SERBOM']||0,g=+o.GOOGLE||0,t=r+v;if(dt&&p)out.push({data:dt,placa:p,km_realizado:r,volta_serbom:v,total_km:t,google:g,diferenca:t-g,percentual:g?(t-g)/g*100:0});}
  const existing=[];for(let offset=0;;offset+=1000){const batch=await api('km_registros?select=data,placa,km_realizado,volta_serbom,google&limit=1000&offset='+offset);existing.push(...batch);if(batch.length<1000)break;}
  const result=deduplicate(out,existing),message=document.getElementById('imsg');
  if(!result.accepted.length){message.textContent=result.duplicates+' registros duplicados ignorados. Nenhum registro novo para importar.';return;}
  if(!confirm('Importar '+result.accepted.length+' registros novos para todos? '+result.duplicates+' duplicados serão ignorados.'))return;
  const inserted=await api('km_registros',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(result.accepted)}),count=inserted.length;
  message.textContent=count+' registros importados. '+(result.duplicates+result.accepted.length-count)+' duplicados ignorados.';await load();
 }catch(e){document.getElementById('imsg').textContent='Importação não concluída: '+e.message;}};
})(typeof window==='object'?window:globalThis);
