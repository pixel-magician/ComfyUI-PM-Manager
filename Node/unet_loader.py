import torch
import comfy.sd
import folder_paths
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
                IO.AnyType.Output("model_name"),
            ],
            accept_all_inputs=True,
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

        # Get unets from hidden inputs (widget name is "unetsWidget")
        unets = kwargs.get('unetsWidget') or kwargs.get('unets')
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

        # Get the relative filename from the full path for output
        # Convert to the format expected by other nodes (with extension)
        import os
        # Get the relative path from models dir
        models_dir = folder_paths.models_dir
        if unet_path.startswith(models_dir):
            relative_path = unet_path[len(models_dir):].lstrip(os.sep)
            # Remove the 'diffusion_models\' or 'unet\' prefix
            if relative_path.startswith('diffusion_models' + os.sep):
                output_name = relative_path[len('diffusion_models' + os.sep):]
            elif relative_path.startswith('unet' + os.sep):
                output_name = relative_path[len('unet' + os.sep):]
            else:
                output_name = os.path.basename(unet_path)
        else:
            output_name = os.path.basename(unet_path)

        return IO.NodeOutput(model, output_name)
