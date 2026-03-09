
import { addUnetsWidget } from "../single_selector/pm_unet_config.js";
import { addVaesWidget } from "../single_selector/pm_vae_config.js";
import { addClipsWidget } from "../single_selector/pm_clip_config.js";
import { addCheckpointsWidget } from "../single_selector/pm_checkpoint_config.js";
import { createLoader } from "./pm_loader_factory.js";

createLoader({
  extensionName: "ComfyUI.PMUNetLoader",
  comfyClasses: ["PMUNetLoader", "PMUNetLoaderLM"],
  widgetPropertyName: "unetsWidget",
  addWidgetFn: addUnetsWidget,
  openMethodName: "openForUNet",
  buttonLabelKey: "selectUNet",
  buttonLabelDefault: "Select UNet"
});

createLoader({
  extensionName: "ComfyUI.PMVAELoader",
  comfyClasses: ["PMVAELoader"],
  widgetPropertyName: "vaesWidget",
  addWidgetFn: addVaesWidget,
  openMethodName: "openForVae",
  buttonLabelKey: "selectVAE",
  buttonLabelDefault: "Select VAE"
});

createLoader({
  extensionName: "ComfyUI.PMClipLoader",
  comfyClasses: ["PMClipLoader"],
  widgetPropertyName: "clipsWidget",
  addWidgetFn: addClipsWidget,
  openMethodName: "openForClip",
  buttonLabelKey: "selectCLIP",
  buttonLabelDefault: "Select CLIP"
});

createLoader({
  extensionName: "ComfyUI.PMCheckpointLoader",
  comfyClasses: ["PMCheckpointLoader"],
  widgetPropertyName: "checkpointsWidget",
  addWidgetFn: addCheckpointsWidget,
  openMethodName: "openForCheckpoint",
  buttonLabelKey: "selectCheckpoint",
  buttonLabelDefault: "Select Checkpoint"
});
