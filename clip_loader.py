import folder_paths
import comfy.sd
import torch
from .pm_utils import get_clip_path, extract_clip_name


class PMClipLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
            },
            "hidden": {
                "clips": ("PM_CLIPS",),
            }
        }

    RETURN_TYPES = ("CLIP",)
    RETURN_NAMES = ("CLIP",)
    FUNCTION = "load_clip"

    CATEGORY = "PM Manager"
    DESCRIPTION = "Loads a CLIP model using PM Manager with enhanced UI. Supports multiple models but only loads the selected one."

    def load_clip(self, clips=None, **kwargs):
        # Process clips from widget - single selection mode
        selected_clip = None
        if clips:
            # Handle both new format {'__value__': [...]} and old format [...]
            if isinstance(clips, dict) and '__value__' in clips:
                clips_list = clips['__value__']
            elif isinstance(clips, list):
                clips_list = clips
            else:
                clips_list = []

            # Find the selected clip (only one can be selected)
            for clip in clips_list:
                if clip.get('selected', False):
                    selected_clip = clip.get('name', '')
                    break

            # If no selected one, use the first one as default
            if not selected_clip and clips_list:
                selected_clip = clips_list[0].get('name', '')

        if not selected_clip:
            raise ValueError("No CLIP model selected")

        # Get full path for the selected clip
        clip_path = get_clip_path(selected_clip)
        if not clip_path:
            raise ValueError(f"CLIP model not found: {selected_clip}")

        clip = comfy.sd.load_clip(clip_path)

        return (clip,)


NODE_CLASS_MAPPINGS = {
    "PMClipLoader": PMClipLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PMClipLoader": "PM Clip Loader",
}
