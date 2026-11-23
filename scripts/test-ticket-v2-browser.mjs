/** Test navigateur isolé : API simulée, aucune DB et aucun envoi. Nécessite Chrome. */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const directory = '/tmp/koinonia-ticket-v2-browser';
await mkdir(directory, { recursive: true });
const png = (await readFile('/tmp/koinonia-ticket-v2/profile-3.png')).toString('base64');
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Editor from './src/app/(auth)/billetterie/[id]/_components/TicketVisualV2Tab';
window.mutations = [];
HTMLElement.prototype.setPointerCapture = () => {};
window.confirm = () => true;
window.fetch = async (url, init) => {
  if (url.includes('/preview')) return new Response(Uint8Array.from(atob('${png}'), c => c.charCodeAt(0)), { headers: {'Content-Type':'image/png'} });
  window.mutations.push(JSON.parse(init.body));
  return new Response('{}', {headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')).render(React.createElement(Editor, {eventId:'isolated-test', initial:{draft:null,published:null}, initialDocument:null, images:[], canEdit:true}));
const wait = ms => new Promise(r => setTimeout(r,ms));
const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label);
const assert = (value, label) => { if (!value) throw new Error(label); };
(async () => {
  await wait(1200);
  assert(document.querySelector('img')?.complete, 'Aperçu chargé');
  button('+ Texte').click(); await wait(60);
  assert(document.querySelector('textarea')?.value === 'Texte', 'Ajout texte');
  const zone = document.querySelector('[aria-label="Sélectionner Texte"]');
  const xInput = () => document.getElementById([...document.querySelectorAll('label')].find(l => l.textContent === 'X').htmlFor);
  zone.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,pointerId:1,clientX:100,clientY:100}));
  zone.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,pointerId:1,clientX:180,clientY:180})); await wait(60);
  zone.dispatchEvent(new PointerEvent('pointerup', {bubbles:true,pointerId:1})); await wait(60);
  assert(Number(xInput().value) > 70, 'Déplacement');
  button('Annuler').click(); await wait(60);
  assert(Number(xInput().value) === 70, 'Annuler déplacement');
  button('Rétablir').click(); await wait(60);
  assert(Number(xInput().value) > 70, 'Rétablir déplacement');
  const widthInput = () => document.getElementById([...document.querySelectorAll('label')].find(l => l.textContent === 'Largeur').htmlFor);
  const originalWidth = Number(widthInput().value);
  const handle = document.querySelector('[aria-label="Sélectionner Texte"] [data-resize]');
  handle.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,pointerId:2,clientX:180,clientY:180}));
  handle.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,pointerId:2,clientX:100,clientY:180})); await wait(60);
  handle.dispatchEvent(new PointerEvent('pointerup', {bubbles:true,pointerId:2})); await wait(60);
  assert(Number(widthInput().value) < originalWidth, 'Redimensionnement');
  button('Annuler').click(); await wait(60);
  assert(Number(widthInput().value) === originalWidth, 'Annuler redimensionnement');
  button('Rétablir').click(); await wait(60);
  assert(Number(widthInput().value) < originalWidth, 'Rétablir redimensionnement');
  button('Dupliquer').click(); await wait(60);
  assert([...document.querySelectorAll('input')].some(i => i.value === 'Texte (copie)'), 'Duplication');
  button('Annuler').click(); await wait(60);
  assert(![...document.querySelectorAll('input')].some(i => i.value === 'Texte (copie)'), 'Annulation');
  button('Rétablir').click(); await wait(60);
  assert([...document.querySelectorAll('input')].some(i => i.value === 'Texte (copie)'), 'Rétablissement');
  await wait(700);
  [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Enregistrer le brouillon')).click(); await wait(80);
  assert(window.mutations.length === 1 && window.mutations[0].publish === false && window.mutations[0].document.version === 2, 'Brouillon sans publication');
  document.body.dataset.result = 'passed';
})().catch(e => { document.body.dataset.result = 'failed'; document.body.dataset.error = e.message; });
`;
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: `${directory}/test.js`, platform: 'browser', format: 'iife', jsx: 'automatic', define: {'process.env.NODE_ENV':'"production"', 'process.env':'{}'}, plugins: [{ name: 'next-isolated', setup(builder) {
  builder.onResolve({ filter: /^next\/(image|navigation)$/ }, args => ({ path: args.path, namespace:'isolated' }));
  builder.onLoad({ filter: /.*/, namespace:'isolated' }, args => ({ contents: args.path.endsWith('navigation') ? 'export const useRouter = () => ({refresh(){}}); export const usePathname = () => "/";' : 'import React from "react"; export default function Image({unoptimized,...props}) {return React.createElement("img",props);}', loader:'js', resolveDir: process.cwd() }));
} }] });
await writeFile(`${directory}/index.html`, '<!doctype html><html><body><div id="root"></div><script>window.onerror=(message)=>{document.body.dataset.error=message;};</script><script src="test.js"></script></body></html>');
const result = spawnSync(process.env.CHROME_BIN ?? '/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', `--user-data-dir=${directory}/chrome-profile`, '--virtual-time-budget=6000', '--dump-dom', `file://${resolve(directory, 'index.html')}`], { encoding:'utf8', timeout:30000, maxBuffer:2_000_000 });
await writeFile(`${directory}/result.html`, result.stdout ?? '');
if (!result.stdout?.includes('data-result="passed"')) { console.error(result.error ?? result.stdout?.match(/data-error="([^"]*)/)?.[1] ?? result.stderr); process.exitCode = 1; }
else console.log('Chrome : aperçu, ajout, déplacement, redimensionnement, duplication, annuler/rétablir, sauvegarde V2 sans publication — OK.');
