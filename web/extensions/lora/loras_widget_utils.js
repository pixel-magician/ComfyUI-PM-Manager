
export const LORA_ENTRY_HEIGHT = 40;
export const HEADER_HEIGHT = 32;
export const CONTAINER_PADDING = 12;
export const EMPTY_CONTAINER_HEIGHT = 100;

export function parseLoraValue(value) {
  if (!value || !Array.isArray(value)) {
    return [];
  }
  return value.map(item => ({
    name: item.name || '',
    active: item.active !== false,
    expanded: item.expanded || false,
    locked: item.locked || false,
    strength: item.strength || 1.0,
    clipStrength: item.clipStrength || 1.0,
    title: item.title || ''
  }));
}

export function formatLoraValue(data) {
  if (!data || !Array.isArray(data)) {
    return [];
  }
  return data.map(item => ({
    name: item.name,
    active: item.active,
    expanded: item.expanded,
    locked: item.locked,
    strength: item.strength,
    clipStrength: item.clipStrength,
    title: item.title || ''
  }));
}

export function updateWidgetHeight(container, calculatedHeight, defaultHeight, node) {
  const finalHeight = Math.max(defaultHeight, calculatedHeight);
  
  container.style.setProperty('--comfy-widget-min-height', `${finalHeight}px`);
  container.style.setProperty('--comfy-widget-height', `${finalHeight}px`);
  
  if (node) {
    setTimeout(() => {
      node.setDirtyCanvas(true, true);
    }, 10);
  }
}

export function shouldShowClipEntry(loraData) {
  return loraData.expanded === true;
}

export function syncClipStrengthIfCollapsed(loraData) {
  if (loraData.hasOwnProperty('expanded') && !loraData.expanded) {
    loraData.clipStrength = loraData.strength;
  }
  return loraData;
}
