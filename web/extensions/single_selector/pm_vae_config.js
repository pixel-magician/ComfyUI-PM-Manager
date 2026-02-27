
import { createSingleSelectorWidget, createOpenDetailsFn } from "./pm_single_selector_widget.js";

export const addVaesWidget = createSingleSelectorWidget({
  containerClass: "pm-vaes-container",
  entryClass: "pm-vae-entry",
  dragHandleClass: "pm-vae-drag-handle",
  toggleClass: "pm-vae-toggle",
  nameClass: "pm-vae-name",
  emptyStateClass: "pm-vae-empty-state",
  contextMenuClass: "pm-vae",
  modelType: "vae",
  emptyMessage: "No VAEs added",
  emptyMessageKey: "noVAEsAdded",
  defaultHeight: 180,
  openDetailsFn: createOpenDetailsFn()
});
