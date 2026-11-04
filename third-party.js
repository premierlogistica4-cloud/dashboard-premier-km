(function(){
'use strict';
const $=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), date=x=>x.split('-').reverse().join('/'), key=(d,p)=>d+'|'+p;
const source=window.PREMIER_ROUTES||[], groups=new Map();
for(const r of source){const k=key(r.data,r.placa);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
function show(rows,full){return '<div class="tablewrap"><table><thead><tr><th>DATA</th><th>PLACA</th><th>TIPO DE VEÍCULO</th><th>ROTAS</th><th>VÍNCULO</th></tr></thead><tbody>'+rows.map(g=>'<tr><td>'+esc(date(g.data))+'</td><td>'+esc(g.placa)+'</td><td>'+esc([...new Set(g.rows.map(x=>x.tipo))].join(' / '))+'</td><td>'+esc([...new Set(g.rows.map(x=>x.rota))].join(' · '))+'</td><td>'+esc(g.matched?'KM correspondente encontrado':'Sem KM correspondente')+(g.duplicates?' · '+g.duplicates+' possível duplicidade':'')+'</td></tr>').join('')+'</tbody></table></div>';}
window.updateThirdParty=function(current){
 if(typeof RAW==='undefined')return;const allKeys=new Set(RAW.map(x=>key(iso(x.data),x.placa))),selectedKeys=new Set(current.map(x=>key(iso(x.data),x.placa)));
 const all=[...groups.values()].map(rows=>{const r=rows[0],unique=new Set(rows.map(x=>JSON.stringify([x.tipo,x.rota])));return {data:r.data,placa:r.placa,rows,duplicates:rows.length-unique.size,matched:allKeys.has(key(r.data,r.placa))};}).sort((a,b)=>b.data.localeCompare(a.data)||a.placa.localeCompare(b.placa));
 const selection=all.filter(x=>selectedKeys.has(key(x.data,x.placa)));const missing=all.filter(x=>!x.matched),dup=all.filter(x=>x.duplicates), noRoute=current.filter(x=>!groups.has(key(iso(x.data),x.placa)));
 $('thirdVehicle').textContent=$('plate').value||new Set(current.map(x=>x.placa)).size+' veículos';$('thirdReal').textContent=$('real').textContent;
 $('thirdRouteDashboard').innerHTML='<div class="panel"><div class="ph"><h2>Rotas vinculadas</h2></div><p class="sub">'+selection.length+' combinações de data e placa no filtro · '+noRoute.length+' registros de KM sem rota correspondente.</p>'+(selection.length?show(selection.slice(0,8)): '<p class="sub">Nenhuma rota correspondente neste filtro.</p>')+'<p class="sub">As rotas compartilham o registro de KM; a distância não é multiplicada.</p><details><summary>Conferir rotas do filtro</summary>'+show(selection)+'</details></div>';
 $('thirdRouteDetails').innerHTML='<div class="panel"><h2>Rotas recebidas · ROTAS.txt</h2><p class="sub">Vínculo exclusivamente por data e placa. Códigos preservados conforme o arquivo.</p><p>'+all.length+' combinações · '+missing.length+' sem KM correspondente · '+dup.reduce((n,x)=>n+x.duplicates,0)+' possível duplicidade exata.</p><details><summary>Ver todas as rotas e vínculos</summary>'+show(all)+'</details><details><summary>Conferir rotas sem correspondência e possíveis duplicidades</summary>'+show(all.filter(x=>!x.matched||x.duplicates))+'</details></div>';
};
if(typeof filtered==='function')window.updateThirdParty(filtered());
})();
