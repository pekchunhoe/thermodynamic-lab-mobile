(function () {
  'use strict';
  const { n, R, Cv, gamma, createState, fmt } = window.Thermo;
  const initial = createState();
  const capacity = n * Cv;
  const actions = {
    heat: { Q: 100, W: 0 }, cool: { Q: -100, W: 0 },
    expand: { Q: 0, W: 100 }, compress: { Q: 0, W: -100 }
  };
  function balance(Q, W) {
    if (![Q, W, Q - W].every(Number.isFinite)) throw new RangeError('Energy must be finite.');
    return Q - W;
  }
  function create() {
    return { Q: 0, W: 0, dU: 0, T: initial.Ti, V: initial.Vi, P: initial.Pi,
      steps: 0, heatSteps: 0, expansionSteps: 0, compressionSteps: 0 };
  }
  // Each transfer is either fixed-volume heat or reversible, insulated piston work.
  // U = n Cv T uses the same gas and heat capacity as Thermo.calculate.
  function transfer(state, q, w) {
    if (![q, w].every(Number.isFinite) || (q !== 0 && w !== 0)) {
      return { ok: false, state, reason: 'Use one heat or work transfer at a time.' };
    }
    const Q = state.Q + q, W = state.W + w, dU = balance(Q, W);
    const T = initial.Ti + dU / capacity;
    const V = w === 0 ? state.V : state.V * Math.pow(state.T / T, 1 / (gamma - 1));
    const P = n * R * T / V;
    if (![T, V, P].every(Number.isFinite) || T < 100 || T > 900 || V < .001 || V > .012 || Math.max(Math.abs(Q), Math.abs(W)) > 20000) {
      return { ok: false, state, reason: 'Model limit reached (100–900 K; 1–12 L). Reverse an action or reset to keep exploring.' };
    }
    return { ok: true, state: { Q, W, dU, T, V, P, steps: state.steps + 1,
      heatSteps: state.heatSteps + Number(q !== 0),
      expansionSteps: state.expansionSteps + Number(w > 0),
      compressionSteps: state.compressionSteps + Number(w < 0) } };
  }
  function act(state, name) {
    const action = actions[name];
    return action ? transfer(state, action.Q, action.W) : { ok: false, state, reason: 'Choose a physical action.' };
  }
  function equation(s) { return `ΔU = ${fmt(s.Q)} − (${fmt(s.W)}) = ${fmt(balance(s.Q, s.W))} J`; }
  window.FirstLawState = { create, balance, transfer, act, actions, equation, capacity };
})();
