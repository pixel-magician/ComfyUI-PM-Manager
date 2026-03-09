
import { createSingleSelectorWidget, createOpenDetailsFn } from "./pm_single_selector_widget.js";

export const addCheckpointsWidget = createSingleSelectorWidget({
  containerClass: "pm-checkpoints-container",
  entryClass: "pm-checkpoint-entry",
  dragHandleClass: "pm-checkpoint-drag-handle",
  toggleClass: "pm-checkpoint-toggle",
  nameClass: "pm-checkpoint-name",
  emptyStateClass: "pm-checkpoint-empty-state",
  contextMenuClass: "pm-checkpoint",
  modelType: "checkpoints",
  emptyMessage: "No checkpoints added",
  emptyMessageKey: "noCheckpointsAdded",
  defaultHeight: 180,
  openDetailsFn: createOpenDetailsFn()
});
