
export function createToggle(active, onChange) {
  const toggle = document.createElement('div');
  toggle.className = `pm-lora-toggle ${active ? 'active' : ''}`;
  
  const check = document.createElement('div');
  check.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" style="opacity: ${active ? '1' : '0'}; transition: opacity 0.2s ease;">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  `;
  check.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;';
  toggle.appendChild(check);
  
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const newActive = !toggle.classList.contains('active');
    toggle.classList.toggle('active', newActive);
    check.querySelector('svg').style.opacity = newActive ? '1' : '0';
    onChange(newActive);
  });
  
  return toggle;
}

export function createArrowButton(direction, onClick) {
  const arrow = document.createElement('button');
  arrow.className = 'pm-lora-arrow';
  arrow.type = 'button';
  arrow.innerHTML = direction === 'left' ? '<' : '>';

  arrow.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  return arrow;
}

export function createStrengthControl(strength, onChange, onDecrease, onIncrease) {
  const control = document.createElement('div');
  control.className = 'pm-lora-strength-wrapper';

  const leftArrow = createArrowButton('left', onDecrease);

  const input = document.createElement('input');
  input.className = 'pm-lora-strength-input';
  input.type = 'number';
  input.value = strength;
  input.min = '-20';
  input.max = '20';
  input.step = '0.01';

  input.addEventListener('change', (e) => {
    const value = parseFloat(e.target.value) || 1.0;
    onChange(value);
  });

  input.addEventListener('focus', (e) => {
    e.target.select();
  });

  const rightArrow = createArrowButton('right', onIncrease);

  control.appendChild(leftArrow);
  control.appendChild(input);
  control.appendChild(rightArrow);

  return { control, input };
}

export function createDragHandle() {
  const handle = document.createElement('div');
  handle.className = 'pm-lora-drag-handle';
  handle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="9" cy="6" r="1"/>
      <circle cx="15" cy="6" r="1"/>
      <circle cx="9" cy="12" r="1"/>
      <circle cx="15" cy="12" r="1"/>
      <circle cx="9" cy="18" r="1"/>
      <circle cx="15" cy="18" r="1"/>
    </svg>
  `;
  return handle;
}

export function createExpandButton(isExpanded, onClick) {
  const button = document.createElement('button');
  button.className = `pm-lora-expand-button ${isExpanded ? 'expanded' : ''}`;
  button.type = 'button';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  `;

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const shouldExpand = !button.classList.contains('expanded');
    button.classList.toggle('expanded', shouldExpand);
    onClick(shouldExpand);
  });
  
  return button;
}

export function updateEntrySelection(entry, isSelected) {
  if (isSelected) {
    entry.classList.add('selected');
  } else {
    entry.classList.remove('selected');
  }
}

