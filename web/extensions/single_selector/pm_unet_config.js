
import { createSingleSelectorWidget, createOpenDetailsFn } from "./pm_single_selector_widget.js";

export const addUnetsWidget = createSingleSelectorWidget({
  containerClass: "pm-unets-container",
  entryClass: "pm-unet-entry",
  dragHandleClass: "pm-unet-drag-handle",
  toggleClass: "pm-unet-toggle",
  nameClass: "pm-unet-name",
  emptyStateClass: "pm-unet-empty-state",
  contextMenuClass: "pm-unet",
  modelType: "diffusion_models",
  emptyMessage: "No UNets added",
  emptyMessageKey: "noUNetsAdded",
  defaultHeight: 180,
  openDetailsFn: createOpenDetailsFn()
});
