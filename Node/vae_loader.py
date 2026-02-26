import comfy.sd
from ..utils.model_paths import get_vae_path


class PMVAELoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "vaes": ("PM_VAES",),
            }
        }

    RETURN_TYPES = ("VAE",)
    RETURN_NAMES = ("VAE",)
    FUNCTION = "load_vae"

    CATEGORY = "PM Manager"
    DESCRIPTION = "Loads a VAE model using PM Manager with enhanced UI. Supports multiple models but only loads the selected one."

    def load_vae(self, vaes=None, **kwargs):
        selected_vae = None
        if vaes:
            if isinstance(vaes, dict) and '__value__' in vaes:
                vaes_list = vaes['__value__']
            elif isinstance(vaes, list):
                vaes_list = vaes
            else:
                vaes_list = []

            for vae in vaes_list:
                if vae.get('selected', False):
                    selected_vae = vae.get('name', '')
                    break

            if not selected_vae and vaes_list:
                selected_vae = vaes_list[0].get('name', '')

        if not selected_vae:
            raise ValueError("No VAE model selected")

        vae_path = get_vae_path(selected_vae)
        if not vae_path:
            raise ValueError(f"VAE model not found: {selected_vae}")

        vae = comfy.sd.load_vae(vae_path)

        return (vae,)


NODE_CLASS_MAPPINGS = {
    "PMVAELoader": PMVAELoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PMVAELoader": "PM VAE Loader",
}
