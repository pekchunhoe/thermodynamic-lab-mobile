// Dependency-free headless Chromium checks. Uses an isolated temporary browser profile.
// Set BROWSER_PATH to a Chromium executable if Edge is not installed at the default path.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'test-results');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8' }[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(resolve(tmpdir(), 'thermo-energy-test-'));
console.log('Starting isolated headless browser.');
const browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
let socket, id = 0, session;
const pending = new Map(), errors = [], report = [];
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timeout = setTimeout(() => reject(new Error('Headless browser did not start')), 20000);
    let log = '';
    browser.on('error', reject);
    browser.on('exit', code => { clearTimeout(timeout); reject(new Error(`Browser exited (${code}): ${log.slice(-1500)}`)); });
    browser.stderr.on('data', chunk => { log += chunk; const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timeout); resolveEndpoint(m[1]); } });
  });
  socket = new WebSocket(endpoint);
  console.log('Connecting browser test session.');
  await new Promise((r, reject) => { const timeout = setTimeout(() => reject(new Error('Browser connection timed out; the sandbox may block loopback connections.')), 15000); socket.onopen = () => { clearTimeout(timeout); r(); }; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { const item = pending.get(message.id); if (item) { pending.delete(message.id); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); } }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  };
  function send(method, params = {}, sid = session) {
    return new Promise((resolveMessage, reject) => { const mid = ++id; const timeout = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 15000); pending.set(mid, { resolve:value => { clearTimeout(timeout); resolveMessage(value); }, reject:error => { clearTimeout(timeout); reject(error); } }); socket.send(JSON.stringify({ id:mid, method, params, ...(sid ? { sessionId:sid } : {}) })); });
  }
  const target = await send('Target.createTarget', { url:'about:blank' });
  session = (await send('Target.attachToTarget', { targetId:target.targetId, flatten:true })).sessionId;
  await send('Page.enable'); await send('Runtime.enable');
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + result.exceptionDetails.exception?.description);
    return result.result.value;
  }
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const mode = name => click(`[data-fl-mode="${name}"]`);
  const action = name => click(`[data-fl-action="${name}"]`);
  async function screenshot(name) {
    const result = await send('Page.captureScreenshot', { format:'png' });
    await writeFile(resolve(output, name + '.png'), Buffer.from(result.data, 'base64'));
  }
  await send('Page.navigate', { url });
  console.log('Checking existing process tabs and First Law interactions.');
  for (let i = 0; i < 100 && !(await evaluate('Boolean(window.FirstLawUI)')); i++) await pause(50);
  assert.equal(await evaluate('Boolean(window.FirstLawUI)'), true, 'First Law initialized');

  // Exercise all existing process tabs and their normal controls before First Law tests.
  for (const process of ['isobaric','isochoric','isothermal','adiabatic']) {
    await click(`[data-process="${process}"]`); await click('#expand'); await click('#preset');
    assert.match(await text('#process-title'), new RegExp(process, 'i'));
    assert.equal(await evaluate('document.querySelectorAll("#pv-graph .path").length'), 1, JSON.stringify(errors));
    assert.equal(await text('#progress-output'), '100%');
    await click('#compress'); await click('#step'); assert.equal(await text('#progress-output'), '10%');
    await click('#explain'); assert.ok((await text('#explanation')).length > 80);
    await click('#check-signs'); assert.ok((await text('#sign-feedback')).length > 0);
    await click('#reset'); assert.equal(await text('#progress-output'), '0%');
  }
  await click('[data-process="compare"]');
  assert.equal(await evaluate('document.querySelectorAll(".compare-card").length'), 4);
  assert.equal(await evaluate('document.querySelectorAll("#compare-graph .comparison-path").length'), 4);
  await click('[data-go="isothermal"]'); assert.equal(await text('#process-title'), 'Isothermal process');
  report.push('All four existing process tabs, controls, explanations, sign checks and Compare passed.');

  await click('[data-process="firstlaw"]');
  const cases = [ [200,0,200], [0,100,-100], [0,-100,100], [300,100,200], [-200,-100,-100], [200,200,0], [-100,-200,100] ];
  for (const [q,w,u] of cases) {
    await click('#fl-reset');
    for (let n = 0; n < Math.abs(q) / 100; n++) await action(q > 0 ? 'heat' : 'cool');
    for (let n = 0; n < Math.abs(w) / 100; n++) await action(w > 0 ? 'expand' : 'compress');
    const f = n => n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
    assert.equal(await text('#fl-result'), `ΔU = ${f(u)} J`);
    assert.equal(await text('#fl-substitution'), `ΔU = ${f(q)} − (${f(w)})`);
  }
  report.push('All seven required physics cases passed through visible controls and equation substitution.');
  await click('#fl-reset');
  await evaluate(`for (let i=0;i<200;i++) document.querySelector('[data-fl-action="compress"]').click()`);
  assert.doesNotMatch(await text('#firstlaw'), /NaN|undefined|Infinity/);
  assert.match(await text('#fl-explanation'), /limit/);
  await click('#fl-reset'); assert.equal(await text('#fl-result'), 'ΔU = 0 J'); assert.equal(await text('#fl-t-value'), '300');
  assert.equal(await evaluate('document.querySelectorAll("#firstlaw .active").length'), 0);
  await action('heat');
  const before = await text('#fl-result');
  await click('[data-process="isobaric"]'); await click('#preset'); await click('[data-process="firstlaw"]');
  assert.equal(await text('#fl-result'), before);
  assert.equal(await evaluate('document.querySelectorAll("#firstlaw .particle").length'), 20);
  report.push('Rapid taps, limits, reset and switching process tabs preserve valid independent state.');

  await mode('challenge');
  const solutions = [['heat','heat','heat'], ['heat','expand'], ['compress'], ['expand'], ['compress'], ['heat','expand'], ['heat','heat','expand'], ['compress','compress','cool']];
  for (const solution of solutions) {
    assert.doesNotMatch(await text('#fl-challenge-feedback'), /Target reached/);
    for (const name of solution) await action(name);
    assert.match(await text('#fl-challenge-feedback'), /Target reached/);
    await click('#fl-new-challenge');
  }
  report.push('All eight challenges are achievable; reset does not auto-complete zero-energy target.');
  await mode('quiz');
  for (let i = 0; i < 12; i++) {
    await click(`[data-fl-answer="${i % 4}"]`); await pause(900);
    assert.match(await text('#fl-quiz-feedback'), /Correct/);
    assert.equal(await evaluate('document.querySelectorAll("[data-fl-answer]:disabled").length'), 4);
    const result = await text('#fl-result'); await click(`[data-fl-answer="${i % 4}"]`); assert.equal(await text('#fl-result'), result);
    const expected = await evaluate(`FirstLawState.equation(FirstLawActivities.questions[${i}])`);
    assert.ok((await text('#fl-explanation')).includes(expected));
    await click('#fl-next');
  }
  await click('[data-fl-answer="1"]'); assert.match(await text('#fl-quiz-feedback'), /Not quite/);
  await click('#fl-reset'); assert.equal(await evaluate('document.querySelectorAll("[data-fl-answer]:disabled").length'), 0);
  report.push('All 12 quiz answers and demonstrations, incorrect feedback, double-submit guard and reset passed.');
  await click('#fl-next'); await click('#fl-next'); // numerical example with heat and work
  await click('[data-fl-answer="2"]');
  await click('[data-process="compare"]'); await click('[data-process="firstlaw"]');
  const variedQuizBalance = await evaluate('FirstLawActivities.questions[2].Q - FirstLawActivities.questions[2].W');
  assert.equal(await text('#fl-result'), `ΔU = ${variedQuizBalance > 0 ? '+' : '−'}${Math.abs(variedQuizBalance)} J`);
  await click('#fl-reset'); await click('[data-fl-answer="2"]'); await click('#fl-reset'); await pause(850);
  assert.equal(await text('#fl-result'), 'ΔU = 0 J');
  await click('[data-fl-answer="2"]'); await mode('explore'); await pause(850);
  assert.equal(await text('#fl-result'), 'ΔU = 0 J');
  report.push('Leaving a quiz mid-animation settles its balance; reset and mode changes cancel pending transfers.');

  await mode('explore'); await action('compress');
  await click('[data-fl-go="adiabatic"]'); assert.equal(await text('#process-title'), 'Adiabatic process');
  await click('[data-process="firstlaw"]'); await click('[data-fl-path="1"]');
  assert.match(await text('#fl-path-equation'), /420.*170.*250/);
  await click('#fl-reset'); await action('heat'); await action('expand');
  for (const [width,height] of [[320,568],[360,800],[375,812],[390,844],[412,915],[768,1024],[1024,768],[1366,768]]) {
    await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:width < 600 });
    await evaluate('document.querySelector("#firstlaw").scrollIntoView()'); await pause(100);
    const layout = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector('.fl-dashboard')).gridTemplateColumns,small:[...document.querySelectorAll('#firstlaw button')].filter(b=>b.getBoundingClientRect().height>0 && b.getBoundingClientRect().height<44).map(b=>b.textContent)})`);
    assert.ok(layout.scroll <= width, `Horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
    assert.deepEqual(layout.small, [], `Tap targets at ${width}`);
    assert.equal(await text('#fl-result'), 'ΔU = 0 J');
    await screenshot(`first-law-${width}x${height}`);
    for (const process of ['isobaric','isochoric','isothermal','adiabatic','compare']) {
      await click(`[data-process="${process}"]`);
      if (process !== 'compare') { await click('#step'); assert.equal(await text('#progress-output'), '10%'); }
      assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), `${process} overflows at ${width}`);
    }
    await click('[data-process="firstlaw"]');
    assert.equal(await text('#fl-result'), 'ΔU = 0 J');
    report.push(`${width} × ${height}: no document overflow, controls ≥44 px high, state preserved. Columns: ${layout.columns}`);
  }
  // Dispatch an actual touch gesture on the visible button, then mouse and keyboard.
  await send('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
  await send('Emulation.setTouchEmulationEnabled', { enabled:true });
  await evaluate(`document.querySelector('[data-fl-action="heat"]').scrollIntoView({block:'center'})`);
  let point = await evaluate(`(()=>{const r=document.querySelector('[data-fl-action="heat"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type:'touchStart',touchPoints:[{...point,radiusX:2,radiusY:2}] });
  await send('Input.dispatchTouchEvent', { type:'touchEnd',touchPoints:[] }); await pause(100);
  assert.equal(await text('#fl-result'), 'ΔU = +100 J');
  await send('Input.dispatchMouseEvent', { type:'mousePressed',...point,button:'left',clickCount:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased',...point,button:'left',clickCount:1 });
  assert.equal(await text('#fl-result'), 'ΔU = +200 J');
  await evaluate(`document.querySelector('[data-fl-action="heat"]').focus()`);
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled:true });
  await send('Input.dispatchKeyEvent', { type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13 });
  assert.equal(await text('#fl-result'), 'ΔU = +300 J');
  await send('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] });
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#firstlaw .particle")).animationName'), 'none');
  await action('compress'); assert.equal(await text('#fl-result'), 'ΔU = +400 J');
  report.push('Native touch, mouse, Enter key and reduced-motion feedback passed.');
  await evaluate('document.querySelector(".fl-accounting").scrollIntoView()');
  await screenshot('first-law-mobile-controls');
  await mode('quiz'); await click('[data-fl-answer="2"]'); await pause(850);
  await evaluate('document.querySelector(".fl-learning").scrollIntoView()');
  await screenshot('first-law-mobile-quiz');
  await send('Emulation.setDeviceMetricsOverride', { width:1024,height:768,deviceScaleFactor:1,mobile:false });
  await mode('challenge'); await action('heat'); await action('heat'); await action('heat');
  await evaluate('document.querySelector("#firstlaw").scrollIntoView()');
  await screenshot('first-law-tablet-challenge');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await writeFile(resolve(output,'browser-report.txt'), report.join('\n') + '\nNo browser runtime errors.\n');
  console.log(report.join('\n'));
} finally {
  socket?.close(); browser.kill(); server.close();
}
