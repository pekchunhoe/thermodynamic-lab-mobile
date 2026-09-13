(function () {
  'use strict';
  const challenges = [
    { title: 'Reach ΔU = +300 J.', hint: 'Heat and compression can both increase internal energy.', test: s => s.dU === 300 },
    { title: 'Reach ΔU = 0 J after transferring energy.', hint: 'Make at least two transfers. Find a way to balance energy in and out.', test: s => s.steps >= 2 && s.dU === 0 },
    { title: 'Increase internal energy while Q = 0.', hint: 'Can work supply the energy?', test: s => s.Q === 0 && s.dU > 0 },
    { title: 'Decrease internal energy while the gas expands.', hint: 'Use expansion so total work is positive and ΔU is negative.', test: s => s.expansionSteps > 0 && s.W > 0 && s.dU < 0 },
    { title: 'Make the gas warmer using compression only.', hint: 'Start fresh and use only Compress Gas.', test: s => s.compressionSteps > 0 && s.heatSteps === 0 && s.expansionSteps === 0 && s.dU > 0 },
    { title: 'Let heat enter the gas, but finish with ΔU = 0.', hint: 'Where could the energy that entered as heat go?', test: s => s.Q > 0 && s.dU === 0 },
    { title: 'Create Q > 0, W > 0 and ΔU > 0.', hint: 'Let the gas do work, but keep some of the incoming energy.', test: s => s.Q > 0 && s.W > 0 && s.dU > 0 },
    { title: 'Create Q < 0 and ΔU > 0.', hint: 'Can compression more than replace the energy lost as heat?', test: s => s.Q < 0 && s.dU > 0 }
  ];
  // Q and W also drive the revealed physical demonstration; all arithmetic uses the engine.
  const questions = [
    { type: 'Predict', prompt: 'Heat enters the gas while no work is done. What happens to ΔU?', Q: 200, W: 0, options: ['Increases', 'Decreases', 'No change', 'Cannot be determined'], answer: 0, why: 'Heat enters: Q > 0. With W = 0, all of that energy increases internal energy.' },
    { type: 'Predict', prompt: 'The gas expands with no heat transfer. What happens to ΔU?', Q: 0, W: 100, options: ['Increases', 'Decreases', 'No change', 'Cannot be determined'], answer: 1, why: 'Q = 0 and W > 0. Energy leaves as work, so internal energy decreases.' },
    { type: 'Calculate ΔU', prompt: 'Q = +500 J and W = +180 J. Find ΔU.', Q: 500, W: 180, options: ['+680 J', '−320 J', '+320 J', '−680 J'], answer: 2, why: 'Subtract the work done by the gas from the heat it receives.' },
    { type: 'Find Q', prompt: 'ΔU = +250 J and W = +100 J. Find Q.', Q: 350, W: 100, options: ['+150 J', '−350 J', '−150 J', '+350 J'], answer: 3, rearrangement: 'Q = ΔU + W = +250 + (+100) = +350 J', why: 'Heat supplies both the increase in internal energy and the work done by the gas.' },
    { type: 'Find W', prompt: 'Q = +400 J and ΔU = +250 J. Find W.', Q: 400, W: 150, options: ['+150 J', '+650 J', '−150 J', '−650 J'], answer: 0, rearrangement: 'W = Q − ΔU = +400 − (+250) = +150 J', why: 'The energy not retained by the gas leaves as work. Positive W means work by the gas.' },
    { type: 'Sign convention', prompt: 'The gas is compressed adiabatically. What are the signs?', Q: 0, W: -100, options: ['Q > 0, W > 0', 'Q = 0, W < 0', 'Q = 0, W > 0', 'Q < 0, W < 0'], answer: 1, why: 'Adiabatic means no heat transfer. Compression is work on the gas, so W is negative.' },
    { type: 'Conceptual', prompt: 'A gas receives 200 J of heat and performs 200 J of work. What happens to its internal energy?', Q: 200, W: 200, options: ['Increases by 400 J', 'Decreases by 200 J', 'No change', 'Increases by 200 J'], answer: 2, why: 'Equal energy enters as heat and leaves as work. ΔU = 0, so the ideal gas returns to its initial temperature.' },
    { type: 'Physical interpretation', prompt: 'Q = 0 and W < 0. Which situation is represented?', Q: 0, W: -100, options: ['Heating a fixed volume', 'Expansion without heat', 'Cooling a fixed volume', 'Compression with work done on the gas'], answer: 3, why: 'There is no heat transfer. Negative W identifies work done on the gas, increasing its internal energy.' },
    { type: 'State function', prompt: 'The same ideal gas takes two paths with identical initial and final temperatures. What must be the same?', Q: 510, W: 260, options: ['ΔU', 'Q', 'W', 'Both Q and W'], answer: 0, why: 'ΔU = nCvΔT depends on the endpoint temperatures. Compare Path A and Path B below: each gives +250 J.' },
    { type: 'Calculate ΔU', prompt: 'Q = −200 J and W = −100 J. Find ΔU.', Q: -200, W: -100, options: ['−300 J', '−100 J', '+100 J', '+300 J'], answer: 1, why: 'The gas loses 200 J as heat and receives 100 J as work. Subtracting negative work adds energy.' },
    { type: 'Predict', prompt: 'Q = −100 J and W = −200 J. Can the gas become warmer?', Q: -100, W: -200, options: ['No, heat always sets temperature', 'No, compression cools gas', 'Yes, ΔU = +100 J', 'Temperature must stay fixed'], answer: 2, why: 'Work on the gas supplies more energy than the heat loss removes. Internal energy and temperature increase.' },
    { type: 'Conceptual', prompt: 'Heat enters while the gas does work. Without the amounts, what can we say about ΔU?', Q: 300, W: 100, options: ['Always positive', 'Always negative', 'Always zero', 'It depends on Q − W'], answer: 3, why: 'The relative amounts matter. The demonstration shows one possible case: Q > W, so ΔU > 0.' }
  ];
  // Endpoint temperatures fix ΔU; the selected balance is independent of the live experiment.
  // Keep the question types and answer positions familiar, while giving numerical
  // practice a fresh set of unambiguous values on every new page session.
  const choose = values => values[Math.floor(Math.random() * values.length)];
  const signed = value => `${value > 0 ? '+' : '−'}${Math.abs(value)} J`;
  {
    const Q = choose([400, 500, 600]), W = choose([100, 180, 220]), dU = Q - W;
    questions[2] = { ...questions[2], prompt: `Q = ${signed(Q)} and W = ${signed(W)}. Find ΔU.`, Q, W,
      options: [signed(Q + W), signed(-dU), signed(dU), signed(-(Q + W))] };
  }
  {
    const dU = choose([240, 260, 300]), W = choose([80, 120, 160]), Q = dU + W;
    questions[3] = { ...questions[3], prompt: `ΔU = ${signed(dU)} and W = ${signed(W)}. Find Q.`, Q, W,
      options: [signed(dU - W), signed(-Q), signed(-dU + W), signed(Q)],
      rearrangement: `Q = ΔU + W = ${signed(dU)} + (${signed(W)}) = ${signed(Q)}` };
  }
  {
    const Q = choose([400, 500, 600]), dU = choose([200, 250, 300]), W = Q - dU;
    questions[4] = { ...questions[4], prompt: `Q = ${signed(Q)} and ΔU = ${signed(dU)}. Find W.`, Q, W,
      options: [signed(W), signed(Q + dU), signed(-W), signed(-(Q + dU))],
      rearrangement: `W = Q − ΔU = ${signed(Q)} − (${signed(dU)}) = ${signed(W)}` };
  }
  {
    const heatOut = choose([220, 260, 300]), workOn = choose([100, 140, 180]);
    const Q = -heatOut, W = -workOn, dU = Q - W;
    questions[9] = { ...questions[9], prompt: `Q = ${signed(Q)} and W = ${signed(W)}. Find ΔU.`, Q, W,
      options: [signed(Q + W), signed(dU), signed(-dU), signed(-(Q + W))] };
  }
  {
    const Q = -choose([100, 120, 150]), W = -choose([220, 260, 300]), dU = Q - W;
    questions[10] = { ...questions[10], prompt: `Q = ${signed(Q)} and W = ${signed(W)}. Can the gas become warmer?`, Q, W,
      options: ['No, heat always sets temperature', 'No, compression cools gas', `Yes, ΔU = ${signed(dU)}`, 'Temperature must stay fixed'] };
  }
  const paths = [{ name: 'A', Q: 510, W: 260 }, { name: 'B', Q: 420, W: 170 }];
  window.FirstLawActivities = { challenges, questions, paths };
})();
