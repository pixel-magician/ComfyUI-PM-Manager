import folder_paths
import os
import hashlib
import numpy as np
import torch
from PIL import Image, ImageSequence, ImageOps
import node_helpers


class PMLoadImage:
    """PM图像加载器节点 - 支持加载各种格式的图像文件"""

    @classmethod
    def INPUT_TYPES(s):
        """定义节点输入类型"""
        input_dir = folder_paths.get_input_directory()
        files = [
            f
            for f in os.listdir(input_dir)
            if os.path.isfile(os.path.join(input_dir, f))
        ]
        files = folder_paths.filter_files_content_types(files, ["image"])
        return {
            "required": {"image": (sorted(files),)},
        }

    CATEGORY = "PM Manager"
    SEARCH_ALIASES = [
        "load image",
        "open image",
        "import image",
        "image input",
        "upload image",
        "read image",
        "image loader",
        "pm load image",
    ]

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load_image"

    def load_image(self, image):
        """加载图像文件并返回图像张量和遮罩"""
        image_path = folder_paths.get_annotated_filepath(image)

        img = node_helpers.pillow(Image.open, image_path)

        output_images = []
        output_masks = []
        w, h = None, None

        # 遍历图像序列（支持GIF等多帧图像）
        for i in ImageSequence.Iterator(img):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)

            # 处理32位整数图像
            if i.mode == "I":
                i = i.point(lambda i: i * (1 / 255))
            image = i.convert("RGB")

            if len(output_images) == 0:
                w = image.size[0]
                h = image.size[1]

            # 跳过尺寸不匹配的帧
            if image.size[0] != w or image.size[1] != h:
                continue

            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            # 检查是否有Alpha通道
            if "A" in i.getbands():
                mask = np.array(i.getchannel("A")).astype(np.float32) / 255.0
                mask = 1.0 - torch.from_numpy(mask)
            # 检查调色板模式是否有透明信息
            elif i.mode == "P" and "transparency" in i.info:
                mask = (
                    np.array(i.convert("RGBA").getchannel("A")).astype(np.float32)
                    / 255.0
                )
                mask = 1.0 - torch.from_numpy(mask)
            else:
                mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
            output_images.append(image)
            output_masks.append(mask.unsqueeze(0))

            # MPO格式只处理第一帧
            if img.format == "MPO":
                break

        # 合并多帧图像
        if len(output_images) > 1:
            output_image = torch.cat(output_images, dim=0)
            output_mask = torch.cat(output_masks, dim=0)
        else:
            output_image = output_images[0]
            output_mask = output_masks[0]

        return (output_image, output_mask)

    @classmethod
    def IS_CHANGED(s, image):
        """检查图像文件是否已更改"""
        image_path = folder_paths.get_annotated_filepath(image)
        m = hashlib.sha256()
        with open(image_path, "rb") as f:
            m.update(f.read())
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(s, image):
        """验证输入文件是否有效"""
        if not folder_paths.exists_annotated_filepath(image):
            return "Invalid image file: {}".format(image)

        return True


# 节点类映射
NODE_CLASS_MAPPINGS = {
    "PMLoadImage": PMLoadImage,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "PMLoadImage": "PM Image Loader",
}
