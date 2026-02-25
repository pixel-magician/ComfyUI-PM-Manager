import os
import folder_paths


def get_lora_path(lora_name):
    """Get full path for a LoRA model by name."""
    lora_path = os.path.join(folder_paths.models_dir, "loras", lora_name)
    if os.path.exists(lora_path):
        return lora_path

    # Try with extensions
    for ext in ['.safetensors', '.pt', '.pth', '.bin', '.ckpt']:
        path_with_ext = lora_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_lora_name(lora_path):
    """Extract the lora name from a lora path."""
    basename = os.path.basename(lora_path)
    return os.path.splitext(basename)[0]


def get_unet_path(unet_name):
    """Get full path for a UNet/diffusion model by name."""
    # Try diffusion_models folder first
    try:
        unet_path = folder_paths.get_full_path("diffusion_models", unet_name)
        if unet_path and os.path.exists(unet_path):
            return unet_path
    except:
        pass

    # Try direct path
    unet_path = os.path.join(folder_paths.models_dir, "diffusion_models", unet_name)
    if os.path.exists(unet_path):
        return unet_path

    # Try with extensions
    for ext in ['.safetensors', '.pt', '.pth', '.bin', '.ckpt', '.sft']:
        path_with_ext = unet_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_unet_name(unet_path):
    """Extract the unet name from a unet path."""
    basename = os.path.basename(unet_path)
    return os.path.splitext(basename)[0]


def get_vae_path(vae_name):
    """Get full path for a VAE model by name."""
    try:
        vae_path = folder_paths.get_full_path("vae", vae_name)
        if vae_path and os.path.exists(vae_path):
            return vae_path
    except:
        pass

    vae_path = os.path.join(folder_paths.models_dir, "vae", vae_name)
    if os.path.exists(vae_path):
        return vae_path

    for ext in ['.safetensors', '.pt', '.pth', '.bin', '.ckpt']:
        path_with_ext = vae_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_vae_name(vae_path):
    """Extract the vae name from a vae path."""
    basename = os.path.basename(vae_path)
    return os.path.splitext(basename)[0]


def get_clip_path(clip_name):
    """Get full path for a CLIP model by name."""
    try:
        clip_path = folder_paths.get_full_path("clip", clip_name)
        if clip_path and os.path.exists(clip_path):
            return clip_path
    except:
        pass

    clip_path = os.path.join(folder_paths.models_dir, "clip", clip_name)
    if os.path.exists(clip_path):
        return clip_path

    for ext in ['.safetensors', '.pt', '.pth', '.bin', '.ckpt']:
        path_with_ext = clip_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_clip_name(clip_path):
    """Extract the clip name from a clip path."""
    basename = os.path.basename(clip_path)
    return os.path.splitext(basename)[0]
