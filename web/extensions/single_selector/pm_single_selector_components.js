
export function createDragHandle(className) {
  const handle = document.createElement('div');
  handle.className = className;
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

export function createToggle(className, active, onChange) {
  const toggle = document.createElement('div');
  toggle.className = `${className} ${active ? 'active' : ''}`;

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

export function updateEntrySelection(entry, isSelected) {
  if (isSelected) {
    entry.classList.add('selected');
  } else {
    entry.classList.remove('selected');
  }
}
