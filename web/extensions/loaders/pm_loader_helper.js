import { app } from "/scripts/app.js";

let pmModelManagerCache = null;

export function findPMModelManager() {
  if (pmModelManagerCache) {
    return pmModelManagerCache;
  }
  for (const ext of app.extensions) {
    if (ext.name === "ComfyUI.PMModelManager") {
      pmModelManagerCache = ext;
      return ext;
    }
  }
  return null;
}

export async function openPMModelManager(node, openMethodName) {
  const manager = findPMModelManager();
  if (manager) {
    await manager[openMethodName](node);
  } else {
    console.error("PM Model Manager not found");
  }
}

export function setupNode(node, config) {
  const {
    widgetPropertyName,
    addWidgetFn,
    openMethodName
  } = config;

  node.serialize_widgets = true;
  
  node.addWidget("button", "选择模型", null, async () => {
    await openPMModelManager(node, openMethodName);
  });
  
  node.pm_selected_model = null;
  node.pm_metadata = {};
  
  node[widgetPropertyName] = addWidgetFn(
    node,
    widgetPropertyName,
    {},
    (value) => {
      // Widget value changed callback
    }
  ).widget;
}

export function loadSavedWidgetValue(node, widgetPropertyName) {
  if (node.widgets_values && node.widgets_values.length > 0) {
    const savedValue = node.widgets_values[node.widgets_values.length - 1];
    if (savedValue && node[widgetPropertyName]) {
      node[widgetPropertyName].value = savedValue;
    }
  }
}
