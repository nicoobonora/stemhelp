import {test} from 'node:test';
import assert from 'node:assert/strict';
import {english,translate,translateMessage} from '../desktop/localization.js';

test('localized copy preserves all placeholders and never interprets inserted content',()=>{
  const placeholders=(value:string)=>[...value.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
  for(const [it,en] of Object.entries(english))assert.deepEqual(placeholders(en),placeholders(it),it);
  const title='Calculus $& {1}';
  assert.equal(translate('Sposta {0} in alto','en',{0:title}),`Move ${title} up`);
  assert.equal(translate('Sposta {0} in alto','it',{0:title}),`Sposta ${title} in alto`);
});

test('application status messages translate while unknown external messages stay intact',()=>{
  assert.equal(translateMessage('Lettura pagina 2 di 30','en'),'Reading page 2 of 30');
  assert.equal(translateMessage('Analisi di Algebra.pdf · parte 1/2','en'),'Analyzing Algebra.pdf · part 1/2');
  assert.equal(translateMessage('Pagina non valida.','en'),'Invalid page.');
  assert.equal(translateMessage('Pagina non valida.','it'),'Pagina non valida.');
  assert.equal(translateMessage('External service detail: 503','en'),'External service detail: 503');
});
