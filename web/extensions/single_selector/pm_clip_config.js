
import { createSingleSelectorWidget, createOpenDetailsFn } from "./pm_single_selector_widget.js";

export const addClipsWidget = createSingleSelectorWidget({
  containerClass: "pm-clips-container",
  entryClass: "pm-clip-entry",
  dragHandleClass: "pm-clip-drag-handle",
  toggleClass: "pm-clip-toggle",
  nameClass: "pm-clip-name",
  emptyStateClass: "pm-clip-empty-state",
  contextMenuClass: "pm-clip",
  modelType: "clip",
  emptyMessage: "No CLIPs added",
  emptyMessageKey: "noCLIPsAdded",
  defaultHeight: 180,
  openDetailsFn: createOpenDetailsFn()
});
