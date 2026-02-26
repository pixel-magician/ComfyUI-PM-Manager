import comfy.sd
from comfy_api.latest import IO
from ..utils.model_paths import get_vae_path


class PMVAELoader(IO.ComfyNode):
    @classmethod
    def define_schema(cls) -> IO.Schema:
        return IO.Schema(
            node_id="PMVAELoader",
            display_name="PM VAE Loader",
            category="PM Manager",
            description="Loads a VAE model using PM Manager with enhanced UI. Supports multiple models but only loads the selected one.",
            inputs=[
            ],
            outputs=[
                IO.Vae.Output("vae"),
            ],
        )

    @classmethod
    def execute(cls, **kwargs) -> IO.NodeOutput:
        # Get vaes from hidden inputs
        vaes = kwargs.get('vaes')
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

        return IO.NodeOutput(vae)
