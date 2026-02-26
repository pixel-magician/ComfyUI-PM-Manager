import torch
import comfy.sd
from comfy_api.latest import IO
from ..utils.model_paths import get_unet_path


class PMUNetLoader(IO.ComfyNode):
    @classmethod
    def define_schema(cls) -> IO.Schema:
        return IO.Schema(
            node_id="PMUNetLoader",
            display_name="PM UNet Loader",
            category="PM Manager",
            description="Loads a UNet diffusion model using PM Manager with enhanced UI. Supports multiple models but only loads the selected one.",
            inputs=[
                IO.Combo.Input("weight_dtype", options=["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]),
            ],
            outputs=[
                IO.Model.Output("model"),
            ],
        )

    @classmethod
    def execute(cls, weight_dtype, **kwargs) -> IO.NodeOutput:
        model_options = {}
        if weight_dtype == "fp8_e4m3fn":
            model_options["dtype"] = torch.float8_e4m3fn
        elif weight_dtype == "fp8_e4m3fn_fast":
            model_options["dtype"] = torch.float8_e4m3fn
            model_options["fp8_optimizations"] = True
        elif weight_dtype == "fp8_e5m2":
            model_options["dtype"] = torch.float8_e5m2

        # Get unets from hidden inputs
        unets = kwargs.get('unets')
        selected_unet = None
        if unets:
            if isinstance(unets, dict) and '__value__' in unets:
                unets_list = unets['__value__']
            elif isinstance(unets, list):
                unets_list = unets
            else:
                unets_list = []

            for unet in unets_list:
                if unet.get('selected', False):
                    selected_unet = unet.get('name', '')
                    break

            if not selected_unet and unets_list:
                selected_unet = unets_list[0].get('name', '')

        if not selected_unet:
            raise ValueError("No UNet model selected")

        unet_path = get_unet_path(selected_unet)
        if not unet_path:
            raise ValueError(f"UNet model not found: {selected_unet}")

        model = comfy.sd.load_diffusion_model(unet_path, model_options=model_options)

        return IO.NodeOutput(model)
