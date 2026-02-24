
import { addUnetsWidget } from "../single_selector/pm_unet_config.js";
import { addVaesWidget } from "../single_selector/pm_vae_config.js";
import { addClipsWidget } from "../single_selector/pm_clip_config.js";
import { createLoader } from "./pm_loader_factory.js";

createLoader({
  extensionName: "ComfyUI.PMUNetLoader",
  comfyClasses: ["PMUNetLoader", "PMUNetLoaderLM"],
  widgetPropertyName: "unetsWidget",
  addWidgetFn: addUnetsWidget,
  openMethodName: "openForUNet"
});

createLoader({
  extensionName: "ComfyUI.PMVAELoader",
  comfyClasses: ["PMVAELoader"],
  widgetPropertyName: "vaesWidget",
  addWidgetFn: addVaesWidget,
  openMethodName: "openForVae"
});

createLoader({
  extensionName: "ComfyUI.PMClipLoader",
  comfyClasses: ["PMClipLoader"],
  widgetPropertyName: "clipsWidget",
  addWidgetFn: addClipsWidget,
  openMethodName: "openForClip"
});
