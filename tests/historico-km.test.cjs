const test=require('node:test'),assert=require('node:assert/strict'),C=require('../frota-core.js');
const a={id:1,data:'2026-01-01',data_fim:'2026-01-03',km_total:300,placa:'ABC1D23',motorista:'Ana',operacao:'BSB'};
const b={...a,id:2,data:'2026-01-05',data_fim:'2026-01-05',km_total:100};
test('history begins at first provided date with zero cumulative baseline',()=>{const c=C.kmHistory([a,b]);assert.equal(c.historyStart,'2026-01-01');assert.equal(c.baseKm,0);assert.equal(c.increaseKm,400);assert.equal(c.accumulatedKm,400);assert.equal(c.percent,null);});
test('later filtered period uses all preceding provided kilometers',()=>{const c=C.kmHistory([a,b],{start:'2026-01-05',end:'2026-01-05'});assert.equal(c.baseKm,300);assert.equal(c.periodKm,100);assert.equal(c.accumulatedKm,400);});
test('overlapping journey counted once in cumulative ledger',()=>{const c=C.kmHistory([a,b],{start:'2026-01-02',end:'2026-01-05'});assert.equal(c.baseKm,0);assert.equal(c.accumulatedKm,400);});
test('same operation/plate/driver scope applies to entire historical baseline',()=>{const c=C.kmHistory([a,b,{...b,id:3,placa:'DEF4G56',km_total:900}],{plate:'ABC1D23',start:'2026-01-05'});assert.equal(c.baseKm,300);assert.equal(c.accumulatedKm,400);assert.equal(C.kmHistory([{...a,km_total:null}]),null);});
