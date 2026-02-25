import comfy.sd
import torch
from ..pm_utils import get_unet_path


class PMUNetLoader:
    """PM UNet加载器节点 - 使用PM Manager加载UNet扩散模型"""

    @classmethod
    def INPUT_TYPES(cls):
        """定义节点输入类型"""
        return {
            "required": {
                "weight_dtype": (
                    ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"],
                )
            },
            "hidden": {
                "unets": ("PM_UNETS",),  # 从PM Manager传入的UNet列表
            },
        }

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("MODEL",)
    FUNCTION = "load_unet"

    CATEGORY = "PM Manager"
    DESCRIPTION = (
        "使用PM Manager加载UNet扩散模型，支持增强UI。支持多个模型但只加载选中的那个。"
    )

    def load_unet(self, weight_dtype, unets=None, **kwargs):
        """加载选中的UNet模型"""
        model_options = {}
        # 根据选择的权重数据类型设置模型选项
        if weight_dtype == "fp8_e4m3fn":
            model_options["dtype"] = torch.float8_e4m3fn
        elif weight_dtype == "fp8_e4m3fn_fast":
            model_options["dtype"] = torch.float8_e4m3fn
            model_options["fp8_optimizations"] = True
        elif weight_dtype == "fp8_e5m2":
            model_options["dtype"] = torch.float8_e5m2

        # 从widget处理unets - 单选模式
        selected_unet = None
        if unets:
            # 处理新格式 {'__value__': [...]} 和旧格式 [...]
            if isinstance(unets, dict) and "__value__" in unets:
                unets_list = unets["__value__"]
            elif isinstance(unets, list):
                unets_list = unets
            else:
                unets_list = []

            # 查找选中的unet（只有一个可以被选中）
            for unet in unets_list:
                if unet.get("selected", False):
                    selected_unet = unet.get("name", "")
                    break

            # 如果没有选中的，默认使用第一个
            if not selected_unet and unets_list:
                selected_unet = unets_list[0].get("name", "")

        if not selected_unet:
            raise ValueError("未选择UNet模型")

        # 获取选中unet的完整路径
        unet_path = get_unet_path(selected_unet)
        if not unet_path:
            raise ValueError(f"未找到UNet模型: {selected_unet}")

        # 使用ComfyUI加载扩散模型
        model = comfy.sd.load_diffusion_model(unet_path, model_options=model_options)

        return (model,)


# 节点类映射
NODE_CLASS_MAPPINGS = {
    "PMUNetLoader": PMUNetLoader,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "PMUNetLoader": "PM UNet Loader",
}
