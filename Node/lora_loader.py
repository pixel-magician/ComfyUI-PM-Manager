import os
import logging
import comfy.sd
import comfy.utils
import folder_paths
from comfy_api.latest import IO
from ..utils.model_paths import get_lora_path


logger = logging.getLogger(__name__)


VALID_LORA_EXTENSIONS = ['.safetensors', '.pt', '.pth', '.bin', '.ckpt']


def normalize_lora_path(lora_path):
    """
    Normalize LoRA path from various formats to full absolute path.

    Supported input formats:
    1. Full absolute path: D:\AI\ComfyUI_Test\models\loras\Z-Image\加速\model.safetensors
    2. Relative path with ext: Z-Image\加速\model.safetensors or Z-Image/加速/model.safetensors
    3. Filename only without ext: model
    4. Filename with ext: model.safetensors

    Returns:
        Full absolute path if found, None otherwise
    """  # noqa: W605
    if not lora_path:
        return None

    # Normalize path separators to os-specific
    normalized_path = lora_path.replace("/", os.sep).replace("\\", os.sep)
    logger.debug("Normalizing LoRA path: %s -> %s", lora_path, normalized_path)

    # If it's already a full absolute path that exists, use it
    if os.path.isabs(normalized_path) and os.path.exists(normalized_path):
        # Validate extension
        if any(normalized_path.endswith(ext) for ext in VALID_LORA_EXTENSIONS):
            logger.debug("Found as absolute path: %s", normalized_path)
            return normalized_path
        logger.warning("File exists but has invalid extension: %s", normalized_path)

    # Use get_lora_path from utils which handles all the lookup logic
    # including extension auto-detection and folder_paths integration
    found_path = get_lora_path(normalized_path)
    if found_path:
        # Validate that the found file has a valid LoRA extension
        if any(found_path.endswith(ext) for ext in VALID_LORA_EXTENSIONS):
            logger.debug("Found via get_lora_path: %s", found_path)
            return found_path
        logger.warning("get_lora_path returned file with invalid extension: %s", found_path)

    # If get_lora_path failed and we have a relative path with subdirectories,
    # try direct path construction
    if os.sep in normalized_path:
        full_path = os.path.join(folder_paths.models_dir, "loras", normalized_path)
        if os.path.exists(full_path):
            if any(full_path.endswith(ext) for ext in VALID_LORA_EXTENSIONS):
                logger.debug("Found as relative path: %s", full_path)
                return full_path

        # Try adding extensions if not present
        if not any(normalized_path.endswith(ext) for ext in VALID_LORA_EXTENSIONS):
            for ext in VALID_LORA_EXTENSIONS:
                path_with_ext = full_path + ext
                if os.path.exists(path_with_ext):
                    logger.debug("Found with extension added: %s", path_with_ext)
                    return path_with_ext

    # Last resort: search recursively by filename (only for valid LoRA files)
    basename = os.path.basename(normalized_path)
    name_without_ext = os.path.splitext(basename)[0]
    loras_dir = os.path.join(folder_paths.models_dir, "loras")

    if os.path.exists(loras_dir):
        logger.debug("Searching recursively in: %s for %s", loras_dir, name_without_ext)
        for root, dirs, files in os.walk(loras_dir):
            for file in files:
                # Only consider files with valid LoRA extensions
                if not any(file.endswith(ext) for ext in VALID_LORA_EXTENSIONS):
                    continue
                file_name = os.path.splitext(file)[0]
                if file_name == name_without_ext:
                    found_path = os.path.join(root, file)
                    logger.debug("Found via recursive search: %s", found_path)
                    return found_path
                if file == basename:
                    found_path = os.path.join(root, file)
                    logger.debug("Found via recursive search (exact match): %s", found_path)
                    return found_path

    logger.warning("Could not find LoRA: %s", lora_path)
    return None


def get_lora_name_for_output(lora_path, output_format="relative_no_ext"):
    """
    Convert full path to the format expected by other plugins.

    output_format options:
    - "relative_no_ext": Relative path without extension (e.g., "Z-Image\加速\model")
    - "filename_only": Just the filename without extension (e.g., "model")
    - "full_path": Full absolute path (PM-Manager format)
    """  # noqa: W605
    if not lora_path:
        return None

    if output_format == "full_path":
        return lora_path

    # Get relative path from loras directory
    loras_dir = os.path.join(folder_paths.models_dir, "loras")
    if lora_path.startswith(loras_dir):
        relative_path = lora_path[len(loras_dir) :].lstrip(os.sep)
    else:
        relative_path = os.path.basename(lora_path)

    # Remove extension
    path_without_ext = os.path.splitext(relative_path)[0]

    if output_format == "filename_only":
        return os.path.basename(path_without_ext)

    # Default: relative_no_ext
    return path_without_ext


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
                IO.AnyType.Input(
                    "lora_stack",
                    optional=True,
                    tooltip="LoRA stack input: list of (lora_path, model_strength, clip_strength) tuples",
                ),
            ],
            outputs=[
                IO.Model.Output("model"),
                IO.Clip.Output("clip"),
                IO.AnyType.Output(
                    "lora_stack",
                    tooltip="LoRA stack output: list of (lora_path, model_strength, clip_strength) tuples",
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def execute(cls, model=None, clip=None, lora_stack=None, **kwargs) -> IO.NodeOutput:
        output_stack = []

        # Process input lora_stack - normalize paths
        normalized_stack = []
        if lora_stack:
            for item in lora_stack:
                if isinstance(item, (tuple, list)) and len(item) >= 3:
                    lora_path, model_strength, clip_strength = item[0], item[1], item[2]
                    # Normalize the path to full absolute path
                    normalized_path = normalize_lora_path(lora_path)
                    if normalized_path:
                        normalized_stack.append(
                            (normalized_path, model_strength, clip_strength)
                        )
                    else:
                        # Keep original if can't normalize, will fail gracefully later
                        normalized_stack.append(
                            (lora_path, model_strength, clip_strength)
                        )
                elif isinstance(item, (tuple, list)) and len(item) >= 2:
                    # Handle case where item might be (path, strength) only
                    lora_path, model_strength = item[0], item[1]
                    clip_strength = model_strength
                    normalized_path = normalize_lora_path(lora_path)
                    if normalized_path:
                        normalized_stack.append(
                            (normalized_path, model_strength, clip_strength)
                        )
                    else:
                        normalized_stack.append(
                            (lora_path, model_strength, clip_strength)
                        )

        output_stack = list(normalized_stack)

        # First, apply all LoRAs from the input lora_stack (if model or clip is provided)
        if normalized_stack and (model is not None or clip is not None):
            for lora_path, model_strength, clip_strength in normalized_stack:
                if not os.path.exists(lora_path):
                    logger.warning("LoRA file not found: %s", lora_path)
                    continue
                try:
                    lora_sd = comfy.utils.load_torch_file(lora_path, safe_load=True)

                    if model is not None:
                        if clip is not None:
                            model, clip = comfy.sd.load_lora_for_models(
                                model, clip, lora_sd, model_strength, clip_strength
                            )
                        else:
                            model, _ = comfy.sd.load_lora_for_models(
                                model, None, lora_sd, model_strength, 0
                            )
                    elif clip is not None:
                        _, clip = comfy.sd.load_lora_for_models(
                            None, clip, lora_sd, 0, clip_strength
                        )
                except Exception as e:
                    logger.error("Error loading LoRA %s: %s", lora_path, e)
                    continue

        # Get loras from hidden inputs (widget name is "lorasWidget")
        loras = kwargs.get("lorasWidget") or kwargs.get("loras")
        if loras:
            if isinstance(loras, dict) and "__value__" in loras:
                loras_list = loras["__value__"]
            elif isinstance(loras, list):
                loras_list = loras
            else:
                loras_list = []

            for lora in loras_list:
                if not lora.get("active", True):
                    continue

                lora_name = lora.get("name", "")
                if not lora_name:
                    continue

                model_strength = float(lora.get("strength", 1.0))
                clip_strength = float(lora.get("clipStrength", model_strength))

                lora_path = get_lora_path(lora_name)
                if lora_path:
                    try:
                        # Load LoRA state dict
                        lora_sd = comfy.utils.load_torch_file(lora_path, safe_load=True)

                        # Only apply LoRA to model if model is provided
                        if model is not None:
                            # Only apply LoRA to clip if clip is provided
                            if clip is not None:
                                model, clip = comfy.sd.load_lora_for_models(
                                    model, clip, lora_sd, model_strength, clip_strength
                                )
                            else:
                                # Apply LoRA only to model (pass None for clip)
                                model, _ = comfy.sd.load_lora_for_models(
                                    model, None, lora_sd, model_strength, 0
                                )
                        elif clip is not None:
                            # Apply LoRA only to clip (pass None for model)
                            _, clip = comfy.sd.load_lora_for_models(
                                None, clip, lora_sd, 0, clip_strength
                            )
                        output_stack.append((lora_path, model_strength, clip_strength))
                    except Exception as e:
                        logger.error("Error loading LoRA %s: %s", lora_path, e)
                        continue

        return IO.NodeOutput(model, clip, output_stack)
