import os
import comfy.sd
import folder_paths
from comfy_api.latest import IO
from ..utils.model_paths import get_clip_path


class PMClipLoader(IO.ComfyNode):
    @classmethod
    def define_schema(cls) -> IO.Schema:
        return IO.Schema(
            node_id="PMClipLoader",
            display_name="PM Clip Loader",
            category="PM Manager",
            description="Loads a CLIP model using PM Manager with enhanced UI. Supports multiple models but only loads the selected one.",
            inputs=[
            ],
            outputs=[
                IO.Clip.Output("clip"),
                IO.AnyType.Output("model_name"),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def execute(cls, **kwargs) -> IO.NodeOutput:
        # Get clips from hidden inputs (widget name is "clipsWidget")
        clips = kwargs.get('clipsWidget') or kwargs.get('clips')
        selected_clip = None
        if clips:
            if isinstance(clips, dict) and '__value__' in clips:
                clips_list = clips['__value__']
            elif isinstance(clips, list):
                clips_list = clips
            else:
                clips_list = []

            for clip in clips_list:
                if clip.get('selected', False):
                    selected_clip = clip.get('name', '')
                    break

            if not selected_clip and clips_list:
                selected_clip = clips_list[0].get('name', '')

        if not selected_clip:
            raise ValueError("No CLIP model selected")

        clip_path = get_clip_path(selected_clip)
        if not clip_path:
            raise ValueError(f"CLIP model not found: {selected_clip}")

        clip = comfy.sd.load_clip([clip_path])

        # Get the relative filename from the full path for output
        models_dir = folder_paths.models_dir
        if clip_path.startswith(models_dir):
            relative_path = clip_path[len(models_dir):].lstrip(os.sep)
            if relative_path.startswith('text_encoders' + os.sep):
                output_name = relative_path[len('text_encoders' + os.sep):]
            elif relative_path.startswith('clip' + os.sep):
                output_name = relative_path[len('clip' + os.sep):]
            else:
                output_name = os.path.basename(clip_path)
        else:
            output_name = os.path.basename(clip_path)

        return IO.NodeOutput(clip, output_name)
