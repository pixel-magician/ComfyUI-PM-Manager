import comfy.sd
from ..pm_utils import get_vae_path


class PMVAELoader:
    """PM VAE加载器节点 - 使用PM Manager加载VAE模型"""

    @classmethod
    def INPUT_TYPES(cls):
        """定义节点输入类型"""
        return {
            "required": {},
            "hidden": {
                "vaes": ("PM_VAES",),  # 从PM Manager传入的VAE列表
            },
        }

    RETURN_TYPES = ("VAE",)
    RETURN_NAMES = ("VAE",)
    FUNCTION = "load_vae"

    CATEGORY = "PM Manager"
    DESCRIPTION = (
        "使用PM Manager加载VAE模型，支持增强UI。支持多个模型但只加载选中的那个。"
    )

    def load_vae(self, vaes=None, **kwargs):
        """加载选中的VAE模型"""
        selected_vae = None
        if vaes:
            # 处理新格式 {'__value__': [...]} 和旧格式 [...]
            if isinstance(vaes, dict) and "__value__" in vaes:
                vaes_list = vaes["__value__"]
            elif isinstance(vaes, list):
                vaes_list = vaes
            else:
                vaes_list = []

            # 查找选中的VAE（只有一个可以被选中）
            for vae in vaes_list:
                if vae.get("selected", False):
                    selected_vae = vae.get("name", "")
                    break

            # 如果没有选中的，默认使用第一个
            if not selected_vae and vaes_list:
                selected_vae = vaes_list[0].get("name", "")

        if not selected_vae:
            raise ValueError("未选择VAE模型")

        # 获取VAE完整路径
        vae_path = get_vae_path(selected_vae)
        if not vae_path:
            raise ValueError(f"未找到VAE模型: {selected_vae}")

        # 使用ComfyUI加载VAE
        vae = comfy.sd.load_vae(vae_path)

        return (vae,)


# 节点类映射
NODE_CLASS_MAPPINGS = {
    "PMVAELoader": PMVAELoader,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "PMVAELoader": "PM VAE Loader",
}
