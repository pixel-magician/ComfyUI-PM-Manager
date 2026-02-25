import comfy.sd
from ..pm_utils import get_clip_path


class PMClipLoader:
    """PM CLIP加载器节点 - 使用PM Manager加载CLIP模型"""

    @classmethod
    def INPUT_TYPES(cls):
        """定义节点输入类型"""
        return {
            "required": {},
            "hidden": {
                "clips": ("PM_CLIPS",),  # 从PM Manager传入的CLIP列表
            },
        }

    RETURN_TYPES = ("CLIP",)
    RETURN_NAMES = ("CLIP",)
    FUNCTION = "load_clip"

    CATEGORY = "PM Manager"
    DESCRIPTION = (
        "使用PM Manager加载CLIP模型，支持增强UI。支持多个模型但只加载选中的那个。"
    )

    def load_clip(self, clips=None, **kwargs):
        """加载选中的CLIP模型"""
        # 从widget处理clips - 单选模式
        selected_clip = None
        if clips:
            # 处理新格式 {'__value__': [...]} 和旧格式 [...]
            if isinstance(clips, dict) and "__value__" in clips:
                clips_list = clips["__value__"]
            elif isinstance(clips, list):
                clips_list = clips
            else:
                clips_list = []

            # 查找选中的clip（只有一个可以被选中）
            for clip in clips_list:
                if clip.get("selected", False):
                    selected_clip = clip.get("name", "")
                    break

            # 如果没有选中的，默认使用第一个
            if not selected_clip and clips_list:
                selected_clip = clips_list[0].get("name", "")

        if not selected_clip:
            raise ValueError("未选择CLIP模型")

        # 获取选中clip的完整路径
        clip_path = get_clip_path(selected_clip)
        if not clip_path:
            raise ValueError(f"未找到CLIP模型: {selected_clip}")

        # 使用ComfyUI加载CLIP
        clip = comfy.sd.load_clip(clip_path)

        return (clip,)


# 节点类映射
NODE_CLASS_MAPPINGS = {
    "PMClipLoader": PMClipLoader,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "PMClipLoader": "PM Clip Loader",
}
