(function(root){'use strict';const states={'Mato Grosso do Sul':'MS','Distrito Federal':'DF','Rio Grande do Norte':'RN','Rio Grande do Sul':'RS','Espírito Santo':'ES','Santa Catarina':'SC','Rio de Janeiro':'RJ','Minas Gerais':'MG','Mato Grosso':'MT','São Paulo':'SP','Pernambuco':'PE','Tocantins':'TO','Rondônia':'RO','Roraima':'RR','Amazonas':'AM','Maranhão':'MA','Paraíba':'PB','Paraná':'PR','Sergipe':'SE','Alagoas':'AL','Amapá':'AP','Bahia':'BA','Ceará':'CE','Goiás':'GO','Piauí':'PI','Pará':'PA','Acre':'AC','Brasília':'DF'};
const names=Object.keys(states).sort((a,b)=>b.length-a.length),pattern=new RegExp('(?<![\\p{L}\\p{N}])('+names.join('|')+')(?![\\p{L}\\p{N}])','giu');const format=value=>typeof value!=='string'?value:value.replace(pattern,(name,_,offset,whole)=>{const original=names.find(n=>n.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')),abbr=states[original];return new RegExp('^\\s*(?:\\('+abbr+'\\)|[/–-]?\\s*'+abbr+'\\b)','i').test(whole.slice(offset+name.length))?name:name+' ('+abbr+')';});const api={format,states};if(typeof module==='object'&&module.exports)module.exports=api;else {root.StateLabels=api;
// Apresentação apenas: mantém valores de formulários e dados oficiais intactos.
const excluded='script,style,textarea,input,[contenteditable]:not([contenteditable="false"])';
function decorate(node){
 if(node.nodeType===3){const parent=node.parentElement;if(!parent||parent.closest(excluded))return;const before=node.nodeValue,after=format(before);if(after!==before){if(parent.tagName==='OPTION'&&!parent.hasAttribute('value'))parent.setAttribute('value',parent.value);node.nodeValue=after;}return;}
 if(node.nodeType!==1||node.matches(excluded))return;
 for(const attr of ['title','aria-label','placeholder','alt'])if(node.hasAttribute(attr)){const before=node.getAttribute(attr),after=format(before);if(after!==before)node.setAttribute(attr,after);}
 for(const child of node.childNodes)decorate(child);
}
function start(){decorate(document.body);new MutationObserver(changes=>{for(const c of changes){if(c.type==='childList')c.addedNodes.forEach(decorate);else if(c.type==='characterData')decorate(c.target);else decorate(c.target);}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder','alt']});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
})(typeof window!=='undefined'?window:globalThis);
