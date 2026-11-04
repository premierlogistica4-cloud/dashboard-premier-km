(function(){
'use strict';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let scheduled=false;
function enhance(table){
 if(table._explorerRefresh){table._explorerRefresh();return;}
 if(table.dataset.explorerReady||table.closest('dialog,details,#ctPreview,#ctTollPreview,#fPreview,.f-preview')||table.querySelector('input,select,textarea,[contenteditable="true"]'))return;
 const body=table.tBodies[0];if(!body)return;let rows=[...body.rows];if(rows.length<=12)return;
 const wrapper=table.closest('.tablewrap')||table.parentElement;if(!wrapper||wrapper.dataset.explorerReady)return;
 table.dataset.explorerReady='true';wrapper.dataset.explorerReady='true';
 const box=document.createElement('div');box.className='table-explorer';
 const field=document.createElement('label');field.className='table-explorer-search';field.append(document.createTextNode('Buscar nos registros'));
 const input=document.createElement('input');input.type='search';input.placeholder='Placa, data, produto ou informação';field.append(input);
 const status=document.createElement('span');status.className='table-explorer-status';status.setAttribute('aria-live','polite');
 const paging=document.createElement('div');paging.className='table-explorer-paging';
 const previous=document.createElement('button'),next=document.createElement('button'),pages=document.createElement('span');previous.type=next.type='button';previous.textContent='← Anterior';next.textContent='Próxima →';paging.append(previous,pages,next);box.append(field,status,paging);wrapper.before(box);
 let page=0;const perPage=10;
 function update(){const q=normalize(input.value).trim();const matching=rows.filter(row=>!q||normalize(row.textContent).includes(q));const n=Math.max(1,Math.ceil(matching.length/perPage));page=Math.max(0,Math.min(page,n-1));const visible=new Set(matching.slice(page*perPage,(page+1)*perPage));for(const row of rows)row.hidden=!visible.has(row);status.textContent=matching.length+' de '+rows.length+' registros';pages.textContent='Página '+(page+1)+' de '+n;previous.disabled=page===0;next.disabled=page>=n-1;}
 table._explorerRefresh=()=>{const fresh=[...body.rows];if(fresh.length===rows.length&&fresh.every((r,i)=>r===rows[i]))return;rows=fresh;page=0;if(table.querySelector('input,select,textarea,[contenteditable="true"]')){box.hidden=true;rows.forEach(row=>row.hidden=false);}else{box.hidden=false;update();}};
 input.addEventListener('input',()=>{page=0;update();});previous.addEventListener('click',()=>{page--;update();});next.addEventListener('click',()=>{page++;update();});update();
}
function scan(){scheduled=false;document.querySelectorAll('#fContent table,#controlRoot table,#vehicles table,#routes table,#compare table').forEach(enhance);}
function queue(){if(!scheduled){scheduled=true;setTimeout(scan,0);}}
new MutationObserver(queue).observe(document.querySelector('main'),{childList:true,subtree:true});queue();
})();
