import comfy.sd
from comfy_api.latest import IO
from ..utils.model_paths import get_lora_path


class PMLoraLoader(IO.ComfyNode):
    @classmethod
    def define_schema(cls) -> IO.Schema:
        return IO.Schema(
            node_id="PMLoraLoader",
            display_name="PM LoRA Loader",
            category="PM Manager",
            description="Loads LoRA models using PM Manager with enhanced UI. Supports lora_stack input and output.",
            inputs=[
                IO.Model.Input("model"),
                IO.Clip.Input("clip"),
                IO.LoraModel.Input("lora_stack", optional=True),
            ],
            outputs=[
                IO.Model.Output("model"),
                IO.Clip.Output("clip"),
                IO.LoraModel.Output("lora_stack"),
            ],
        )

    @classmethod
    def execute(cls, model, clip, lora_stack=None, **kwargs) -> IO.NodeOutput:
        output_stack = list(lora_stack) if lora_stack else []

        # Get loras from hidden inputs
        loras = kwargs.get('loras')
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
                    model, clip = comfy.sd.load_lora_for_models(model, clip, lora_path, model_strength, clip_strength)
                    output_stack.append((lora_path, model_strength, clip_strength))

        return IO.NodeOutput(model, clip, output_stack)
