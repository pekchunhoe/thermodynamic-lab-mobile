(function () {
  'use strict';
  const engine = window.FirstLawState;
  const { challenges, questions, paths } = window.FirstLawActivities;
  const { fmt } = window.Thermo;
  const root = document.querySelector('#firstlaw');
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  let state = engine.create(), mode = 'explore', challengeIndex = 0, questionIndex = 0;
  let answered = false, achieved = null, animationTimer = null, demoTimer = null, completeDemo = null;
  const initialExplanation = 'Start with 300 K gas. Add or remove heat, or move the piston to transfer energy as work.';
  let explanation = initialExplanation;

  // Reuse the existing cylinder, particles, arrows and state display, with local IDs.
  function cloneVisual(selector, host) {
    const copy = document.querySelector(selector).cloneNode(true);
    [copy, ...copy.querySelectorAll('[id]')].forEach(el => { if (el.id) el.id = `fl-${el.id}`; });
    $(host).append(copy);
    return copy;
  }
  const stage = cloneVisual('#simulation .cylinder-stage', '#fl-visual-host');
  cloneVisual('#simulation .state-strip', '#fl-state-host');
  const surroundings = document.createElement('span');
  surroundings.className = 'fl-surroundings'; surroundings.textContent = 'SURROUNDINGS'; stage.append(surroundings);
  const system = document.createElement('div');
  system.className = 'fl-system'; system.innerHTML = '<b>SYSTEM</b><span>Ideal gas</span>';
  $('#fl-gas').append(system);
  $('#fl-gas').setAttribute('aria-label', 'System: ideal gas. Dashed outline is the system boundary; particle speed shows temperature.');
  [$('#fl-heat-arrow'), $('#fl-work-arrow')].forEach(el => {
    el.removeAttribute('style'); el.className = el.id === 'fl-heat-arrow' ? 'heat-arrow left' : 'work-arrow right';
    el.setAttribute('aria-hidden', 'true');
  });

  function stopAnimation(settle = true) {
    clearTimeout(animationTimer); clearTimeout(demoTimer); animationTimer = demoTimer = null;
    if (settle && completeDemo) completeDemo();
    completeDemo = null;
    $$('.heat-arrow,.work-arrow').forEach(el => el.classList.remove('active'));
    $('#fl-transfer').classList.remove('pulse');
  }
  function showTransfer(q, w) {
    clearTimeout(animationTimer);
    const isHeat = q !== 0, incoming = isHeat ? q > 0 : w < 0;
    const arrow = $(isHeat ? '#fl-heat-arrow' : '#fl-work-arrow');
    $$('.heat-arrow,.work-arrow').forEach(el => el.classList.remove('active'));
    arrow.classList.toggle('outbound', !incoming);
    arrow.classList.toggle('inbound', !isHeat && incoming);
    arrow.classList.add('active');
    arrow.querySelector('b').textContent = isHeat ? `Q ${incoming ? '>' : '<'} 0` : `W ${incoming ? '<' : '>'} 0`;
    const label = $('#fl-transfer');
    label.dataset.kind = isHeat ? (incoming ? 'heat' : 'cool') : 'work';
    label.replaceChildren();
    const flow = document.createElement('b'), detail = document.createElement('span');
    flow.textContent = incoming ? `${isHeat ? 'Surroundings' : 'Piston / surroundings'} → GAS` : `GAS → ${isHeat ? 'surroundings' : 'piston / surroundings'}`;
    detail.textContent = isHeat ? `${fmt(q)} J heat` : `${fmt(w)} J work · Work done ${incoming ? 'on' : 'by'} gas`;
    label.append(flow, detail);
    label.classList.remove('pulse'); void label.offsetWidth; label.classList.add('pulse');
    animationTimer = setTimeout(() => { arrow.classList.remove('active'); label.classList.remove('pulse'); }, 1100);
  }
  function describe(q, w) {
    if (q > 0) return `${fmt(q).slice(1)} J entered as heat. The piston was held fixed, so this action did no work: internal energy increased by ${Math.abs(q)} J.`;
    if (q < 0) return `${Math.abs(q)} J left as heat. With the piston held fixed, internal energy decreased by ${Math.abs(q)} J and the gas cooled.`;
    if (w > 0) return `The gas did ${w} J of work on the piston. With no heat added during this action, internal energy decreased by ${w} J.`;
    return `The surroundings did ${Math.abs(w)} J of work on the gas. This action has W = ${fmt(w)} J, so subtracting W increased internal energy by ${Math.abs(w)} J.`;
  }
  function renderLinks() {
    const links = [];
    if (state.steps) {
      if (state.heatSteps === 0) links.push(['adiabatic', 'No heat has crossed the boundary (Q = 0): the energy condition used in an adiabatic process.']);
      if (state.expansionSteps + state.compressionSteps === 0) links.push(['isochoric', 'The piston has stayed fixed (W = 0): the energy condition for an isochoric process.']);
      if (state.dU === 0) links.push(['isothermal', 'For an ideal gas, ΔU = 0 means the same final temperature. This connects to isothermal behaviour, where temperature stays constant throughout.']);
    }
    $('#fl-links').replaceChildren();
    links.forEach(([process, message]) => {
      const p = document.createElement('p'), button = document.createElement('button');
      p.textContent = message; button.textContent = `View ${process[0].toUpperCase() + process.slice(1)}`;
      button.dataset.flGo = process; $('#fl-links').append(p, button);
    });
  }
  function renderChallenge() {
    const task = challenges[challengeIndex];
    $('#fl-challenge-count').textContent = `MAKE IT HAPPEN · ${challengeIndex + 1} / ${challenges.length}`;
    $('#fl-target').textContent = task.title; $('#fl-hint').textContent = task.hint;
    if (mode === 'challenge' && !achieved && state.steps > 0 && task.test(state)) achieved = { ...state };
    const feedback = $('#fl-challenge-feedback');
    feedback.classList.toggle('success', Boolean(achieved));
    feedback.textContent = achieved ? `Target reached! ${engine.equation(achieved)}. You can keep exploring or try a new challenge.` : `Current ΔU = ${fmt(state.dU)} J. Use the physical controls; any valid solution counts.`;
  }
  function render() {
    $('#fl-q').textContent = `Q = ${fmt(state.Q)} J`; $('#fl-w').textContent = `W = ${fmt(state.W)} J`;
    $('#fl-u').textContent = `ΔU = ${fmt(state.dU)} J`;
    $('#fl-w-meaning').textContent = state.W < 0 ? 'Work done on the gas' : state.W > 0 ? 'Work done by the gas' : 'No net work transfer';
    $('#fl-u-meaning').textContent = `Internal energy ${state.dU > 0 ? 'increased' : state.dU < 0 ? 'decreased' : 'unchanged'}`;
    $('#fl-substitution').textContent = `ΔU = ${fmt(state.Q)} − (${fmt(state.W)})`;
    $('#fl-result').textContent = `ΔU = ${fmt(state.dU)} J`;
    $('#fl-explanation').textContent = explanation;
    $('#fl-p-value').textContent = (state.P / 1000).toFixed(1);
    $('#fl-v-value').textContent = (state.V * 1000).toFixed(2);
    $('#fl-t-value').textContent = state.T.toFixed(0);
    // A fixed scale across experiments. Heat at fixed volume never moves the piston.
    const height = 24 + state.V / .012 * 52;
    $('#fl-gas').style.height = `${height}%`;
    $('#fl-piston').style.top = `calc(${100 - height}% - 22px)`;
    // Blend blue directly toward a muted red, avoiding a misleading green midpoint.
    const warmth = Math.max(0, Math.min(1, (state.T - 300) / 400));
    const cooling = Math.max(0, Math.min(1, (300 - state.T) / 200));
    const rgb = [58, 123, 185].map((cold, i) => Math.round(cold + ([202, 86, 67][i] - cold) * warmth + ( [37, 101, 186][i] - cold) * cooling));
    const top = rgb.map(channel => Math.min(255, channel + 22));
    $('#fl-gas').style.background = `linear-gradient(180deg,rgb(${top.join(',')}),rgb(${rgb.join(',')}))`;
    // Molecular speed scales as sqrt(T), not linearly with energy.
    $$('.particle').forEach(p => p.style.setProperty('--speed', `${1 / Math.sqrt(state.T / 300)}s`));
    $('#fl-motion').textContent = state.steps ? (state.dU > 0 ? 'warmer than reset' : state.dU < 0 ? 'cooler than reset' : 'same temperature') : 'ready';
    $$('[data-fl-action]').forEach(button => { button.disabled = mode === 'quiz'; });
    $('#fl-action-note').textContent = mode === 'quiz' ? 'Choose an answer below to reveal its energy transfers.' : 'Heat: piston held fixed. Work: no heat transfer.';
    renderChallenge(); renderLinks();
  }
  function reset() {
    stopAnimation(false); state = engine.create(); achieved = null; answered = false; explanation = initialExplanation;
    $('#fl-transfer').textContent = 'Choose an action to see energy cross the boundary.'; delete $('#fl-transfer').dataset.kind;
    if (mode === 'quiz') renderQuestion();
    render();
  }
  function doAction(name) {
    if (mode === 'quiz') return;
    const result = engine.act(state, name);
    if (result.ok) { state = result.state; const { Q, W } = engine.actions[name]; explanation = describe(Q, W); showTransfer(Q, W); }
    else explanation = result.reason;
    render();
  }
  function setMode(next) {
    if (mode === next) return;
    mode = next;
    $$('[data-fl-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.flMode === mode)));
    ['explore', 'challenge', 'quiz'].forEach(name => $(`#fl-${name}`).classList.toggle('hidden', name !== mode));
    reset();
  }
  function renderQuestion() {
    const q = questions[questionIndex];
    $('#fl-question-count').textContent = `${q.type.toUpperCase()} · ${questionIndex + 1} / ${questions.length}`;
    $('#fl-question').textContent = q.prompt;
    $('#fl-options').replaceChildren();
    q.options.forEach((text, index) => {
      const button = document.createElement('button'); button.textContent = text; button.dataset.flAnswer = index;
      $('#fl-options').append(button);
    });
    $('#fl-quiz-feedback').className = 'fl-feedback hidden'; $('#fl-quiz-feedback').textContent = '';
    $('#fl-next').classList.add('hidden');
  }
  function answer(index) {
    if (mode !== 'quiz' || answered) return;
    const q = questions[questionIndex]; answered = true;
    const correct = index === q.answer;
    $$('[data-fl-answer]').forEach((button, i) => {
      button.disabled = true; button.classList.toggle('correct', i === q.answer); button.classList.toggle('incorrect', i === index && !correct);
    });
    const feedback = $('#fl-quiz-feedback'); feedback.className = `fl-feedback${correct ? ' success' : ''}`;
    const verdict = document.createElement('b'), why = document.createElement('p'), equation = document.createElement('p');
    verdict.textContent = correct ? 'Correct.' : `Not quite. Answer: ${q.options[q.answer]}.`;
    why.textContent = q.why; equation.textContent = q.rearrangement || engine.equation(q);
    feedback.replaceChildren(verdict, why, equation);
    $('#fl-next').classList.remove('hidden'); $('#fl-next').focus({ preventScroll: true });
    // Reveal each actual transfer in sequence; reset/mode/tab changes cancel pending work.
    const transfers = [[q.Q, 0], [0, q.W]].filter(([heat, work]) => heat !== 0 || work !== 0);
    // Leaving the tab settles the answered example; resetting discards it instead.
    completeDemo = () => {
      for (const transfer of transfers.splice(0)) {
        const result = engine.transfer(state, ...transfer);
        if (result.ok) state = result.state;
      }
      explanation = `${q.why} ${engine.equation(state)}`; render();
    };
    function reveal() {
      const transfer = transfers.shift(); if (!transfer) return;
      const result = engine.transfer(state, ...transfer);
      if (result.ok) { state = result.state; explanation = describe(...transfer); showTransfer(...transfer); render(); }
      if (transfers.length) demoTimer = setTimeout(reveal, 750);
      else { completeDemo = null; explanation = `${q.why} ${engine.equation(state)}`; render(); }
    }
    reveal();
  }
  function selectPath(index) {
    $$('[data-fl-path]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.flPath) === index)));
    $('#fl-path-equation').textContent = `Path ${paths[index].name}: ${engine.equation(paths[index])}`;
  }
  // One delegated listener for the lifetime of this tab, including dynamically rendered answers.
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.flAction) doAction(button.dataset.flAction);
    else if (button.dataset.flMode) setMode(button.dataset.flMode);
    else if (button.dataset.flAnswer !== undefined) answer(Number(button.dataset.flAnswer));
    else if (button.dataset.flPath !== undefined) selectPath(Number(button.dataset.flPath));
    else if (button.dataset.flGo) { document.querySelector(`.tab[data-process="${button.dataset.flGo}"]`).click(); document.querySelector('#simulation').scrollIntoView({ block: 'start' }); }
    else if (button.id === 'fl-reset') reset();
    else if (button.id === 'fl-new-challenge') { challengeIndex = (challengeIndex + 1) % challenges.length; reset(); }
    else if (button.id === 'fl-next') { questionIndex = (questionIndex + 1) % questions.length; reset(); $('#fl-question').setAttribute('tabindex', '-1'); $('#fl-question').focus({ preventScroll: true }); }
  });
  window.FirstLawUI = { stopAnimation };
  selectPath(0); render();
})();
