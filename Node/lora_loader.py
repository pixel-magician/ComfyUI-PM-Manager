import comfy.sd
import comfy.utils
from comfy_api.latest import IO
from ..utils.model_paths import get_lora_path


class PMLoraLoader(IO.ComfyNode):
    @classmethod
    def define_schema(cls) -> IO.Schema:
        return IO.Schema(
            node_id="PMLoraLoader",
            display_name="PM LoRA Loader",
            category="PM Manager",
            description="Loads LoRA models using PM Manager with enhanced UI. Supports lora_stack input and output. Model and Clip inputs are optional when only outputting lora_stack.",
            inputs=[
                IO.Model.Input("model", optional=True),
                IO.Clip.Input("clip", optional=True),
                IO.LoraModel.Input("lora_stack", optional=True),
            ],
            outputs=[
                IO.Model.Output("model"),
                IO.Clip.Output("clip"),
                IO.LoraModel.Output("lora_stack"),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def execute(cls, model=None, clip=None, lora_stack=None, **kwargs) -> IO.NodeOutput:
        output_stack = list(lora_stack) if lora_stack else []

        # First, apply all LoRAs from the input lora_stack (if model or clip is provided)
        if lora_stack and (model is not None or clip is not None):
            for lora_path, model_strength, clip_strength in lora_stack:
                lora_sd = comfy.utils.load_torch_file(lora_path, safe_load=True)

                if model is not None:
                    if clip is not None:
                        model, clip = comfy.sd.load_lora_for_models(model, clip, lora_sd, model_strength, clip_strength)
                    else:
                        model, _ = comfy.sd.load_lora_for_models(model, None, lora_sd, model_strength, 0)
                elif clip is not None:
                    _, clip = comfy.sd.load_lora_for_models(None, clip, lora_sd, 0, clip_strength)

        # Get loras from hidden inputs (widget name is "lorasWidget")
        loras = kwargs.get('lorasWidget') or kwargs.get('loras')
        if loras:
            if isinstance(loras, dict) and '__value__' in loras:
                loras_list = loras['__value__']
            elif isinstance(loras, list):
                loras_list = loras
            else:
                loras_list = []

            for lora in loras_list:
                if not lora.get('active', True):
                    continue

                lora_name = lora.get('name', '')
                if not lora_name:
                    continue

                model_strength = float(lora.get('strength', 1.0))
                clip_strength = float(lora.get('clipStrength', model_strength))

                lora_path = get_lora_path(lora_name)
                if lora_path:
                    # Load LoRA state dict
                    lora_sd = comfy.utils.load_torch_file(lora_path, safe_load=True)

                    # Only apply LoRA to model if model is provided
                    if model is not None:
                        # Only apply LoRA to clip if clip is provided
                        if clip is not None:
                            model, clip = comfy.sd.load_lora_for_models(model, clip, lora_sd, model_strength, clip_strength)
                        else:
                            # Apply LoRA only to model (pass None for clip)
                            model, _ = comfy.sd.load_lora_for_models(model, None, lora_sd, model_strength, 0)
                    elif clip is not None:
                        # Apply LoRA only to clip (pass None for model)
                        _, clip = comfy.sd.load_lora_for_models(None, clip, lora_sd, 0, clip_strength)
                    output_stack.append((lora_path, model_strength, clip_strength))

        return IO.NodeOutput(model, clip, output_stack)
