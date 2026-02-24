
import { app } from "/scripts/app.js";
import { addLorasWidget } from "./loras_widget.js";
import { setupNode, loadSavedWidgetValue } from "../loaders/pm_loader_helper.js";

app.registerExtension({
    name: "ComfyUI.PMLoraLoader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "PMLoraLoader") {
            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (originalOnNodeCreated) {
                    originalOnNodeCreated.apply(this, arguments);
                }
                setupNode(this, {
                    widgetPropertyName: "lorasWidget",
                    addWidgetFn: addLorasWidget,
                    openMethodName: "openForLora"
                });
            };
        }
    },
    
    async loadedGraphNode(node) {
        if (node.comfyClass === "PMLoraLoader") {
            loadSavedWidgetValue(node, "lorasWidget");
        }
    }
});
