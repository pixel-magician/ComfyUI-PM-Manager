import os
import torch
import comfy.sd
import folder_paths
from comfy_api.latest import IO
from ..utils.model_paths import get_checkpoint_path


class PMCheckpointLoader(IO.ComfyNode):
    @classmethod
    def define_schema(cls) -> IO.Schema:
        return IO.Schema(
            node_id="PMCheckpointLoader",
            display_name="PM Checkpoint Loader",
            category="PM Manager",
            description="Loads a checkpoint model using PM Manager with enhanced UI. Supports multiple models but only loads the selected one.",
            inputs=[
                IO.Combo.Input("weight_dtype", options=["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]),
            ],
            outputs=[
                IO.Model.Output("model"),
                IO.Clip.Output("clip"),
                IO.Vae.Output("vae"),
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

        # Get checkpoints from hidden inputs (widget name is "checkpointsWidget")
        checkpoints = kwargs.get('checkpointsWidget') or kwargs.get('checkpoints')
        selected_checkpoint = None
        if checkpoints:
            if isinstance(checkpoints, dict) and '__value__' in checkpoints:
                checkpoints_list = checkpoints['__value__']
            elif isinstance(checkpoints, list):
                checkpoints_list = checkpoints
            else:
                checkpoints_list = []

            for checkpoint in checkpoints_list:
                if checkpoint.get('selected', False):
                    selected_checkpoint = checkpoint.get('name', '')
                    break

            if not selected_checkpoint and checkpoints_list:
                selected_checkpoint = checkpoints_list[0].get('name', '')

        if not selected_checkpoint:
            raise ValueError("No checkpoint model selected")

        checkpoint_path = get_checkpoint_path(selected_checkpoint)
        if not checkpoint_path:
            raise ValueError(f"Checkpoint model not found: {selected_checkpoint}")

        # Load checkpoint using comfy.sd.load_checkpoint_guess_config
        model, clip, vae, _ = comfy.sd.load_checkpoint_guess_config(
            checkpoint_path,
            output_vae=True,
            output_clip=True,
            output_clipvision=False,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            output_model=True,
            model_options=model_options
        )

        # Get the relative filename from the full path for output
        models_dir = folder_paths.models_dir
        if checkpoint_path.startswith(models_dir):
            relative_path = checkpoint_path[len(models_dir):].lstrip(os.sep)
            # Remove the 'checkpoints\' prefix
            if relative_path.startswith('checkpoints' + os.sep):
                output_name = relative_path[len('checkpoints' + os.sep):]
            else:
                output_name = os.path.basename(checkpoint_path)
        else:
            output_name = os.path.basename(checkpoint_path)

        return IO.NodeOutput(model, clip, vae, output_name)
