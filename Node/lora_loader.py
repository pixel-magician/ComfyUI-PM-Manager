import comfy.sd
from ..utils.model_paths import get_lora_path


class PMLoraLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
            },
            "optional": {
                "lora_stack": ("LORA_STACK",),
            },
            "hidden": {
                "loras": ("PM_LORAS",),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "LORA_STACK")
    RETURN_NAMES = ("MODEL", "CLIP", "lora_stack")
    FUNCTION = "load_lora"

    CATEGORY = "PM Manager"
    DESCRIPTION = "Loads LoRA models using PM Manager with enhanced UI. Supports lora_stack input and output."

    def load_lora(self, model, clip, lora_stack=None, loras=None, **kwargs):
        # Start with existing lora_stack if provided
        output_stack = list(lora_stack) if lora_stack else []

        # Process loras from widget
        if loras:
            # Handle both new format {'__value__': [...]} and old format [...]
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

                # Get lora path
                lora_path = get_lora_path(lora_name)
                if lora_path:
                    # Load the lora
                    model, clip = comfy.sd.load_lora_for_models(model, clip, lora_path, model_strength, clip_strength)
                    # Add to output stack
                    output_stack.append((lora_path, model_strength, clip_strength))

        return (model, clip, output_stack)


NODE_CLASS_MAPPINGS = {
    "PMLoraLoader": PMLoraLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PMLoraLoader": "PM LoRA Loader",
}
