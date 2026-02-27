
import { app } from "/scripts/app.js";
import { setupNode, loadSavedWidgetValue } from "./pm_loader_helper.js";

export function createLoader(config) {
  const {
    extensionName,
    comfyClasses,
    widgetPropertyName,
    addWidgetFn,
    openMethodName
  } = config;

  app.registerExtension({
    name: extensionName,
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
      if (comfyClasses.includes(nodeType.comfyClass)) {
        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
          if (originalOnNodeCreated) {
            originalOnNodeCreated.apply(this, arguments);
          }
          setupNode(this, {
            widgetPropertyName,
            addWidgetFn,
            openMethodName
          });
        };
      }
    },
    
    async loadedGraphNode(node) {
      if (comfyClasses.includes(node.comfyClass)) {
        loadSavedWidgetValue(node, widgetPropertyName);
      }
    }
  });
}
