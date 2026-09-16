import { JOINT_GROUPS } from './data.js';

const SIDE_LABEL = { R: 'Right', L: 'Left' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// `ranges[fullId]` holds this individual's measured extrema for the joint
// (defaults to the standard neutral-zero values from data.js, editable).
function buildSliderRow(fullId, def, state, ranges, onChange) {
  ranges[fullId] = ranges[fullId] ?? { min: def.min, max: def.max };
  const range = ranges[fullId];

  const row = el('div', 'joint-row');
  const top = el('div', 'joint-row-top');
  const label = el('span', 'joint-label', def.label);
  const readout = el('span', 'joint-readout', '0°');
  top.append(label, readout);

  const slider = el('input', 'joint-slider');
  slider.type = 'range';
  slider.min = range.min;
  slider.max = range.max;
  slider.step = 1;
  const initial = clamp(state[fullId] ?? 0, range.min, range.max);
  slider.value = initial;
  state[fullId] = initial;
  readout.textContent = `${initial}°`;

  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    state[fullId] = v;
    readout.textContent = `${v}°`;
    row.classList.toggle('is-active', v !== 0);
    onChange(fullId, v);
  });
  row.classList.toggle('is-active', Number(slider.value) !== 0);

  const ends = el('div', 'joint-ends');

  const minField = el('label', 'end-field');
  minField.append(el('span', 'end-label', def.minLabel));
  const minInput = document.createElement('input');
  minInput.type = 'number';
  minInput.className = 'end-input';
  minInput.min = 0;
  minInput.max = 270;
  minInput.step = 1;
  minInput.value = Math.abs(range.min);
  minField.append(minInput, el('span', 'end-deg', '°'));

  const maxField = el('label', 'end-field end-field-right');
  const maxInput = document.createElement('input');
  maxInput.type = 'number';
  maxInput.className = 'end-input';
  maxInput.min = 0;
  maxInput.max = 270;
  maxInput.step = 1;
  maxInput.value = Math.abs(range.max);
  maxField.append(maxInput, el('span', 'end-deg', '°'), el('span', 'end-label', def.maxLabel));

  ends.append(minField, maxField);

  function applyRange() {
    const newMin = -Math.abs(Number(minInput.value) || 0);
    const newMax = Math.abs(Number(maxInput.value) || 0);
    range.min = newMin;
    range.max = newMax;
    slider.min = newMin;
    slider.max = newMax;
    const v = clamp(Number(slider.value), newMin, newMax);
    slider.value = v;
    state[fullId] = v;
    readout.textContent = `${v}°`;
    row.classList.toggle('is-active', v !== 0);
    onChange(fullId, v);
  }
  minInput.addEventListener('change', applyRange);
  maxInput.addEventListener('change', applyRange);

  row.append(top, slider, ends);
  row._slider = slider;
  row._readout = readout;
  row._minInput = minInput;
  row._maxInput = maxInput;
  row._def = def;
  return row;
}

export function buildControlPanel(container, state, ranges, rig, onChange) {
  const rows = {}; // fullId -> row element (with _slider/_readout/_minInput/_maxInput)

  for (const group of JOINT_GROUPS) {
    const details = el('details', 'joint-group');
    details.open = true;
    const summary = el('summary', null, group.label);
    details.append(summary);

    if (group.side === 'pair') {
      const mirrorWrap = el('label', 'mirror-toggle');
      const mirrorBox = document.createElement('input');
      mirrorBox.type = 'checkbox';
      mirrorWrap.append(mirrorBox, document.createTextNode(' Mirror Right → Left'));
      summary.append(mirrorWrap);
      mirrorWrap.addEventListener('click', (e) => e.stopPropagation());

      const cols = el('div', 'side-columns');
      const sideRowMap = { R: {}, L: {} };
      for (const side of ['R', 'L']) {
        const col = el('div', 'side-column');
        col.append(el('h4', null, SIDE_LABEL[side]));
        for (const jointDef of group.joints) {
          const fullId = `${jointDef.id}_${side}`;
          const row = buildSliderRow(fullId, jointDef, state, ranges, onChange);
          rows[fullId] = row;
          sideRowMap[side][jointDef.id] = row;
          col.append(row);
        }
        cols.append(col);
      }
      details.append(cols);

      mirrorBox.addEventListener('change', () => {
        if (!mirrorBox.checked) return;
        for (const jointDef of group.joints) {
          sideRowMap.R[jointDef.id]._slider.dispatchEvent(new Event('input'));
        }
      });
      for (const jointDef of group.joints) {
        sideRowMap.R[jointDef.id]._slider.addEventListener('input', () => {
          if (!mirrorBox.checked) return;
          const lRow = sideRowMap.L[jointDef.id];
          const v = sideRowMap.R[jointDef.id]._slider.value;
          lRow._slider.value = clamp(Number(v), Number(lRow._slider.min), Number(lRow._slider.max));
          lRow._slider.dispatchEvent(new Event('input'));
        });
      }
    } else {
      for (const jointDef of group.joints) {
        const fullId = jointDef.id;
        const row = buildSliderRow(fullId, jointDef, state, ranges, onChange);
        rows[fullId] = row;
        details.append(row);
      }
    }

    container.append(details);
  }

  return rows;
}

export function resetAll(state, rows, onChange) {
  for (const fullId of Object.keys(state)) {
    const row = rows[fullId];
    const lo = row ? Number(row._slider.min) : -Infinity;
    const hi = row ? Number(row._slider.max) : Infinity;
    const v = clamp(0, lo, hi);
    state[fullId] = v;
    if (row) {
      row._slider.value = v;
      row._readout.textContent = `${v}°`;
      row.classList.toggle('is-active', v !== 0);
    }
    onChange(fullId, v);
  }
}

export function resetRanges(ranges, rows, state, onChange) {
  for (const [fullId, row] of Object.entries(rows)) {
    const def = row._def;
    ranges[fullId] = { min: def.min, max: def.max };
    row._minInput.value = Math.abs(def.min);
    row._maxInput.value = Math.abs(def.max);
    row._slider.min = def.min;
    row._slider.max = def.max;
    const v = clamp(Number(row._slider.value), def.min, def.max);
    row._slider.value = v;
    state[fullId] = v;
    row._readout.textContent = `${v}°`;
    row.classList.toggle('is-active', v !== 0);
    onChange(fullId, v);
  }
}

export function applyState(state, rows, onChange, ranges) {
  for (const [fullId, value] of Object.entries(state)) {
    const row = rows[fullId];
    if (row) {
      if (ranges && ranges[fullId]) {
        row._minInput.value = Math.abs(ranges[fullId].min);
        row._maxInput.value = Math.abs(ranges[fullId].max);
        row._slider.min = ranges[fullId].min;
        row._slider.max = ranges[fullId].max;
      }
      const v = clamp(value, Number(row._slider.min), Number(row._slider.max));
      row._slider.value = v;
      row._readout.textContent = `${v}°`;
      row.classList.toggle('is-active', v !== 0);
      onChange(fullId, v);
    }
  }
}

const ALL_LABELS = (() => {
  const map = {};
  for (const group of JOINT_GROUPS) {
    for (const jointDef of group.joints) {
      if (group.side === 'pair') {
        map[`${jointDef.id}_R`] = `Right ${group.label} – ${jointDef.label}`;
        map[`${jointDef.id}_L`] = `Left ${group.label} – ${jointDef.label}`;
      } else {
        map[jointDef.id] = `${group.label} – ${jointDef.label}`;
      }
    }
  }
  return map;
})();

export function generateSummaryText(state, heightCm) {
  const lines = [`Best Corrected Position — standing height ${heightCm} cm`, ''];
  const nonZero = Object.entries(state).filter(([, v]) => v !== 0);
  if (nonZero.length === 0) {
    lines.push('All joints at neutral zero (anatomical position).');
  } else {
    for (const [id, v] of nonZero) {
      lines.push(`${ALL_LABELS[id] || id}: ${v > 0 ? '+' : ''}${v}°`);
    }
  }
  return lines.join('\n');
}
