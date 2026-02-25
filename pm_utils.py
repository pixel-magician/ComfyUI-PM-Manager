import os
import folder_paths


def get_lora_path(lora_name):
    """根据名称获取LoRA模型的完整路径"""
    lora_path = os.path.join(folder_paths.models_dir, "loras", lora_name)
    if os.path.exists(lora_path):
        return lora_path

    # 尝试添加各种扩展名
    for ext in [".safetensors", ".pt", ".pth", ".bin", ".ckpt"]:
        path_with_ext = lora_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_lora_name(lora_path):
    """从LoRA路径中提取模型名称（不含扩展名）"""
    basename = os.path.basename(lora_path)
    return os.path.splitext(basename)[0]


def get_unet_path(unet_name):
    """根据名称获取UNet/扩散模型的完整路径"""
    # 首先尝试diffusion_models文件夹
    try:
        unet_path = folder_paths.get_full_path("diffusion_models", unet_name)
        if unet_path and os.path.exists(unet_path):
            return unet_path
    except:
        pass

    # 尝试直接路径
    unet_path = os.path.join(folder_paths.models_dir, "diffusion_models", unet_name)
    if os.path.exists(unet_path):
        return unet_path

    # 尝试添加各种扩展名
    for ext in [".safetensors", ".pt", ".pth", ".bin", ".ckpt", ".sft"]:
        path_with_ext = unet_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_unet_name(unet_path):
    """从UNet路径中提取模型名称（不含扩展名）"""
    basename = os.path.basename(unet_path)
    return os.path.splitext(basename)[0]


def get_vae_path(vae_name):
    """根据名称获取VAE模型的完整路径"""
    try:
        vae_path = folder_paths.get_full_path("vae", vae_name)
        if vae_path and os.path.exists(vae_path):
            return vae_path
    except:
        pass

    vae_path = os.path.join(folder_paths.models_dir, "vae", vae_name)
    if os.path.exists(vae_path):
        return vae_path

    for ext in [".safetensors", ".pt", ".pth", ".bin", ".ckpt"]:
        path_with_ext = vae_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_vae_name(vae_path):
    """从VAE路径中提取模型名称（不含扩展名）"""
    basename = os.path.basename(vae_path)
    return os.path.splitext(basename)[0]


def get_clip_path(clip_name):
    """根据名称获取CLIP模型的完整路径"""
    try:
        clip_path = folder_paths.get_full_path("clip", clip_name)
        if clip_path and os.path.exists(clip_path):
            return clip_path
    except:
        pass

    clip_path = os.path.join(folder_paths.models_dir, "clip", clip_name)
    if os.path.exists(clip_path):
        return clip_path

    for ext in [".safetensors", ".pt", ".pth", ".bin", ".ckpt"]:
        path_with_ext = clip_path + ext
        if os.path.exists(path_with_ext):
            return path_with_ext

    return None


def extract_clip_name(clip_path):
    """从CLIP路径中提取模型名称（不含扩展名）"""
    basename = os.path.basename(clip_path)
    return os.path.splitext(basename)[0]
