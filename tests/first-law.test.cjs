const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
for (const file of ['thermodynamics', 'first-law-state', 'first-law-activities']) {
  vm.runInContext(fs.readFileSync(`${__dirname}/../js/${file}.js`, 'utf8'), context);
}
const { FirstLawState: engine, FirstLawActivities: data, Thermo } = context.window;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const cases = [[200, 0, 200], [0, 100, -100], [0, -100, 100], [300, 100, 200], [-200, -100, -100], [200, 200, 0], [-100, -200, 100]];
for (const [Q, W, dU] of cases) test(`Q=${Q}, W=${W} => ΔU=${dU}`, () => {
  let s = engine.create();
  for (const [q, w] of [[Q, 0], [0, W]]) {
    if (q === 0 && w === 0) continue;
    const result = engine.transfer(s, q, w); assert.equal(result.ok, true); s = result.state;
  }
  assert.equal(s.dU, dU); assert.equal(s.Q, Q); assert.equal(s.W, W);
  close(Thermo.n * Thermo.Cv * (s.T - 300), dU);
  close(s.P * s.V, Thermo.n * Thermo.R * s.T);
});
test('Work matches the existing adiabatic calculation; heat holds volume fixed', () => {
  const s = engine.create();
  for (const name of ['expand', 'compress']) {
    const end = engine.act(s, name).state;
    const existing = Thermo.calculate({ ...Thermo.createState('adiabatic', name === 'expand' ? 'expansion' : 'compression'), progress: Math.abs(end.V / s.V - 1) * 200 });
    close(existing.W, end.W); close(existing.T, end.T); close(existing.P, end.P);
  }
  close(engine.act(s, 'heat').state.V, s.V);
  close(engine.act(s, 'cool').state.V, s.V);
});
test('Eight challenges are reachable, including multiple target solutions', () => {
  const solutions = [['heat','heat','heat'], ['heat','expand'], ['compress'], ['expand'], ['compress'], ['heat','expand'], ['heat','heat','expand'], ['compress','compress','cool']];
  const run = path => path.reduce((s, action) => { const result = engine.act(s, action); assert.equal(result.ok, true); return result.state; }, engine.create());
  data.challenges.forEach((c, i) => { assert.equal(c.test(engine.create()), false); assert.equal(c.test(run(solutions[i])), true); });
  assert.equal(data.challenges[0].test(run(['heat','heat','heat','heat','expand'])), true);
  assert.equal(data.challenges[0].test(run(['heat','heat','compress'])), true);
  assert.equal(data.challenges[4].test(run(['heat','cool','compress'])), false);
});
test('Every quiz demonstration is finite and yields its stated balance', () => {
  assert.equal(data.questions.length, 12);
  for (const q of data.questions) {
    assert.ok(q.options[q.answer]); let s = engine.create();
    assert.equal(new Set(q.options).size, q.options.length, `Duplicate answer choices: ${q.prompt}`);
    for (const [heat, work] of [[q.Q, 0], [0, q.W]]) {
      if (!heat && !work) continue;
      const result = engine.transfer(s, heat, work); assert.equal(result.ok, true, q.prompt); s = result.state;
    }
    close(s.dU, q.Q - q.W);
  }
  for (const path of data.paths) assert.equal(engine.balance(path.Q, path.W), 250);
});
test('Repeated actions stop at physical bounds without mutating the previous state', () => {
  for (const action of Object.keys(engine.actions)) {
    let s = engine.create(), rejected = 0;
    for (let i = 0; i < 1000; i++) {
      const before = JSON.stringify(s), result = engine.act(s, action);
      assert.equal(JSON.stringify(s), before);
      if (!result.ok) rejected++;
      s = result.state;
      assert.ok([s.Q,s.W,s.dU,s.T,s.V,s.P].every(Number.isFinite));
      assert.ok(s.T >= 100 && s.T <= 900 && s.V >= .001 && s.V <= .012);
    }
    assert.ok(rejected > 0);
  }
  assert.equal(engine.transfer(engine.create(), NaN, 0).ok, false);
  assert.equal(engine.transfer(engine.create(), Infinity, 0).ok, false);
  assert.throws(() => engine.balance(Infinity, 0));
});
test('Existing process invariants and energy conservation remain intact', () => {
  for (const process of ['isobaric','isochoric','isothermal','adiabatic']) for (const direction of ['expansion','compression']) for (const progress of [0,50,100]) {
    const s = Thermo.calculate(Thermo.createState(process, direction, progress));
    close(s.dU, s.Q - s.W); close(s.P * s.V, Thermo.n * Thermo.R * s.T);
    if (process === 'isobaric') close(s.P, s.Pi);
    if (process === 'isochoric') { close(s.V, s.Vi); close(s.W, 0); }
    if (process === 'isothermal') { close(s.T, s.Ti); close(s.dU, 0); }
    if (process === 'adiabatic') close(s.Q, 0);
  }
});
