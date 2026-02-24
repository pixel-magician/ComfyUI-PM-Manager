import folder_paths
import comfy.sd
import torch
from .pm_utils import get_unet_path, extract_unet_name


class PMUNetLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "weight_dtype": (["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"],)
            },
            "hidden": {
                "unets": ("PM_UNETS",),
            }
        }

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("MODEL",)
    FUNCTION = "load_unet"

    CATEGORY = "PM Manager"
    DESCRIPTION = "Loads a UNet diffusion model using PM Manager with enhanced UI. Supports multiple models but only loads the selected one."

    def load_unet(self, weight_dtype, unets=None, **kwargs):
        model_options = {}
        if weight_dtype == "fp8_e4m3fn":
            model_options["dtype"] = torch.float8_e4m3fn
        elif weight_dtype == "fp8_e4m3fn_fast":
            model_options["dtype"] = torch.float8_e4m3fn
            model_options["fp8_optimizations"] = True
        elif weight_dtype == "fp8_e5m2":
            model_options["dtype"] = torch.float8_e5m2

        # Process unets from widget - single selection mode
        selected_unet = None
        if unets:
            # Handle both new format {'__value__': [...]} and old format [...]
            if isinstance(unets, dict) and '__value__' in unets:
                unets_list = unets['__value__']
            elif isinstance(unets, list):
                unets_list = unets
            else:
                unets_list = []

            # Find the selected unet (only one can be selected)
            for unet in unets_list:
                if unet.get('selected', False):
                    selected_unet = unet.get('name', '')
                    break

            # If no selected one, use the first one as default
            if not selected_unet and unets_list:
                selected_unet = unets_list[0].get('name', '')

        if not selected_unet:
            raise ValueError("No UNet model selected")

        # Get full path for the selected unet
        unet_path = get_unet_path(selected_unet)
        if not unet_path:
            raise ValueError(f"UNet model not found: {selected_unet}")

        model = comfy.sd.load_diffusion_model(unet_path, model_options=model_options)

        return (model,)


NODE_CLASS_MAPPINGS = {
    "PMUNetLoader": PMUNetLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PMUNetLoader": "PM UNet Loader",
}
