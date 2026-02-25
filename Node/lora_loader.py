import comfy.sd
from ..pm_utils import get_lora_path


class PMLoraLoader:
    """PM LoRA加载器节点 - 使用PM Manager加载LoRA模型"""

    @classmethod
    def INPUT_TYPES(cls):
        """定义节点输入类型"""
        return {
            "required": {
                "model": ("MODEL",),  # 输入模型
                "clip": ("CLIP",),  # 输入CLIP
            },
            "optional": {
                "lora_stack": ("LORA_STACK",),  # 可选的LoRA堆栈输入
            },
            "hidden": {
                "loras": ("PM_LORAS",),  # 从PM Manager传入的LoRA列表
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "LORA_STACK")
    RETURN_NAMES = ("MODEL", "CLIP", "lora_stack")
    FUNCTION = "load_lora"

    CATEGORY = "PM Manager"
    DESCRIPTION = "使用PM Manager加载LoRA模型，支持增强UI。支持lora_stack输入和输出。"

    def load_lora(self, model, clip, lora_stack=None, loras=None, **kwargs):
        """加载LoRA模型并应用到输入模型和CLIP"""
        # 从现有lora_stack开始（如果提供）
        output_stack = list(lora_stack) if lora_stack else []

        # 处理widget中的loras
        if loras:
            # 处理新格式 {'__value__': [...]} 和旧格式 [...]
            if isinstance(loras, dict) and "__value__" in loras:
                loras_list = loras["__value__"]
            elif isinstance(loras, list):
                loras_list = loras
            else:
                loras_list = []

            for lora in loras_list:
                # 跳过未激活的LoRA
                if not lora.get("active", True):
                    continue

                lora_name = lora.get("name", "")
                if not lora_name:
                    continue

                # 获取模型强度和CLIP强度
                model_strength = float(lora.get("strength", 1.0))
                clip_strength = float(lora.get("clipStrength", model_strength))

                # 获取LoRA路径
                lora_path = get_lora_path(lora_name)
                if lora_path:
                    # 加载LoRA
                    model, clip = comfy.sd.load_lora_for_models(
                        model, clip, lora_path, model_strength, clip_strength
                    )
                    # 添加到输出堆栈
                    output_stack.append((lora_path, model_strength, clip_strength))

        return (model, clip, output_stack)


# 节点类映射
NODE_CLASS_MAPPINGS = {
    "PMLoraLoader": PMLoraLoader,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "PMLoraLoader": "PM LoRA Loader",
}
