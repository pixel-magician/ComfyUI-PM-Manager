import { app } from "/scripts/app.js";
import { t, initPromise, onLocaleChange } from "../common/i18n.js";

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
    openMethodName,
    buttonLabelKey = "selectModel",
    buttonLabelDefault = "Select Model"
  } = config;

  node.serialize_widgets = true;

  // Create button widget with default label first
  const buttonWidget = node.addWidget("button", buttonLabelDefault, null, async () => {
    await openPMModelManager(node, openMethodName);
  });

  // Store original key for language switching
  buttonWidget._pmLabelKey = buttonLabelKey;
  buttonWidget._pmLabelDefault = buttonLabelDefault;

  // Update button label after translations are loaded
  initPromise.then(() => {
    buttonWidget.name = t(buttonLabelKey, buttonLabelDefault);
    if (app.graph) {
      app.graph.setDirtyCanvas(true, true);
    }
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
