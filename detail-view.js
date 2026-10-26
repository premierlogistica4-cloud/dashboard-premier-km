(function(){'use strict';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('dialog');dialog.id='premierDetailDialog';dialog.setAttribute('aria-labelledby','premierDetailTitle');document.body.append(dialog);
 let origin=null;
 function close(){dialog.close();if(origin?.isConnected)origin.focus();origin=null;}
 dialog.addEventListener('click',event=>{if(event.target.closest('[data-detail-close]'))close();});
 dialog.addEventListener('cancel',()=>{if(origin?.isConnected)origin.focus();origin=null;});
 document.addEventListener('click',event=>{
  const summary=event.target.closest('summary');if(!summary||summary.closest('dialog'))return;
  const source=summary.parentElement;if(source.tagName!=='DETAILS')return;
  if(!source.closest('#frotaRoot,#controlRoot,#kmVehicleCosts'))return;
  if(source.querySelector('form,input,select,button,[data-action],[data-act]'))return;
  event.preventDefault();origin=summary;source.open=false;
  const copy=source.cloneNode(true);copy.querySelector('summary')?.remove();
  copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  const row=source.closest('tr'),context=source.dataset.detailContext||([...row?.cells||[]].slice(0,3).map(el=>el.textContent.trim()).join(' · '));
  dialog.innerHTML='<header class="pd-header"><div><p class="pd-eyebrow">DETALHAMENTO ANALÍTICO</p><h2 id="premierDetailTitle">'+escape(source.dataset.detailTitle||summary.textContent.trim())+'</h2>'+(context?'<p class="pd-context">'+escape(context)+'</p>':'')+'</div><button type="button" data-detail-close autofocus aria-label="Fechar detalhamento">Fechar ✕</button></header><div class="pd-content">'+copy.innerHTML+'</div><footer class="pd-footer">Leitura dos dados exibidos no momento da abertura. Valores e critérios preservados.</footer>';
  dialog.showModal();
 });
})();