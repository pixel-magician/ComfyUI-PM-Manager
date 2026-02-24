
export const ENTRY_HEIGHT = 40;
export const CONTAINER_PADDING = 12;
export const EMPTY_CONTAINER_HEIGHT = 100;

export function parseValue(value) {
  if (!value || !Array.isArray(value)) {
    return [];
  }
  return value.map(item => ({
    name: item.name || '',
    selected: item.selected || false
  }));
}

export function formatValue(data) {
  if (!data || !Array.isArray(data)) {
    return [];
  }
  return data.map(item => ({
    name: item.name,
    selected: item.selected
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
