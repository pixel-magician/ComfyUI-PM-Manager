import os
import json
import logging
import traceback
from datetime import datetime
from aiohttp import web
import folder_paths
import urllib.parse
from PIL import Image

logger = logging.getLogger(__name__)

# 导入视频服务器端点
from . import pm_video_server


from .Node.unet_loader import (
    NODE_CLASS_MAPPINGS as UNET_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as UNET_NODE_DISPLAY_NAME_MAPPINGS,
)
from .Node.lora_loader import (
    NODE_CLASS_MAPPINGS as LORA_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as LORA_NODE_DISPLAY_NAME_MAPPINGS,
)
from .Node.vae_loader import (
    NODE_CLASS_MAPPINGS as VAE_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as VAE_NODE_DISPLAY_NAME_MAPPINGS,
)
from .Node.clip_loader import (
    NODE_CLASS_MAPPINGS as CLIP_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as CLIP_NODE_DISPLAY_NAME_MAPPINGS,
)
from .Node.image_loader import (
    NODE_CLASS_MAPPINGS as IMAGE_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as IMAGE_NODE_DISPLAY_NAME_MAPPINGS,
)
from .Node.audio_loader import (
    NODE_CLASS_MAPPINGS as AUDIO_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as AUDIO_NODE_DISPLAY_NAME_MAPPINGS,
)
from .Node.video_loader import (
    NODE_CLASS_MAPPINGS as VIDEO_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as VIDEO_NODE_DISPLAY_NAME_MAPPINGS,
)

# 合并所有节点类映射
NODE_CLASS_MAPPINGS = {
    **UNET_NODE_CLASS_MAPPINGS,
    **LORA_NODE_CLASS_MAPPINGS,
    **VAE_NODE_CLASS_MAPPINGS,
    **CLIP_NODE_CLASS_MAPPINGS,
    **IMAGE_NODE_CLASS_MAPPINGS,
    **AUDIO_NODE_CLASS_MAPPINGS,
    **VIDEO_NODE_CLASS_MAPPINGS,
}
# 合并所有节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    **UNET_NODE_DISPLAY_NAME_MAPPINGS,
    **LORA_NODE_DISPLAY_NAME_MAPPINGS,
    **VAE_NODE_DISPLAY_NAME_MAPPINGS,
    **CLIP_NODE_DISPLAY_NAME_MAPPINGS,
    **IMAGE_NODE_DISPLAY_NAME_MAPPINGS,
    **AUDIO_NODE_DISPLAY_NAME_MAPPINGS,
    **VIDEO_NODE_DISPLAY_NAME_MAPPINGS,
}


WEB_DIRECTORY = "./web"
__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]


def get_user_id_from_request(request):
    """从请求中获取用户ID"""
    from comfy.cli_args import args

    user = "default"

    try:
        # 如果启用多用户模式，从请求头中获取用户ID
        if args.multi_user and "comfy-user" in request.headers:
            user = request.headers["comfy-user"]

            # 系统用户前缀检查
            if user.startswith(folder_paths.SYSTEM_USER_PREFIX):
                user = "default"

        # 从PromptServer获取用户管理器
        from server import PromptServer

        if PromptServer.instance and hasattr(PromptServer.instance, "user_manager"):
            try:
                users = PromptServer.instance.user_manager.users
                if user in users:
                    return user

                # 如果指定用户不存在，返回第一个用户
                if len(users) > 0:
                    first_user = next(iter(users.keys()))
                    return first_user
            except:
                pass
    except:
        pass

    return user


def get_pm_workflows_dir(user_id="default"):
    """获取PM工作流目录"""
    user_dir = folder_paths.get_user_directory()
    user_workflow_dir = os.path.join(user_dir, user_id, "workflows")
    os.makedirs(user_workflow_dir, exist_ok=True)
    return user_workflow_dir


def get_pm_models_dir():
    """获取模型目录"""
    return folder_paths.models_dir


def get_pm_input_dir():
    """获取输入目录"""
    return folder_paths.get_input_directory()


def get_pm_output_dir():
    """获取输出目录"""
    return folder_paths.get_output_directory()


def get_file_size(file_path):
    """获取文件大小并格式化为人类可读格式"""
    size_bytes = os.path.getsize(file_path)
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def load_pm_metadata(current_dir, name_without_ext):
    """加载PM元数据文件"""
    pm_path = os.path.join(current_dir, f"{name_without_ext}.pm")
    metadata = {}
    if os.path.exists(pm_path):
        try:
            with open(pm_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except:
            pass
    return metadata


def has_models_or_subfolders(dir_path):
    """检查目录是否包含模型文件或子文件夹"""
    if not os.path.exists(dir_path):
        return False

    try:
        for entry in os.listdir(dir_path):
            entry_path = os.path.join(dir_path, entry)
            if os.path.isfile(entry_path) and entry.endswith(
                (".safetensors", ".pt", ".pth", ".bin", ".ckpt")
            ):
                return True
            if os.path.isdir(entry_path):
                if has_models_or_subfolders(entry_path):
                    return True
    except:
        pass

    return False


def has_media_or_subfolders(dir_path):
    """检查目录是否包含媒体文件或子文件夹"""
    if not os.path.exists(dir_path):
        return False

    image_extensions = (
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".bmp",
        ".tiff",
        ".tif",
    )
    audio_extensions = (".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a")
    video_extensions = (".mp4", ".webm", ".avi", ".mov", ".mkv")

    try:
        for entry in os.listdir(dir_path):
            entry_path = os.path.join(dir_path, entry)
            if os.path.isfile(entry_path):
                entry_lower = entry.lower()
                if (
                    entry_lower.endswith(image_extensions)
                    or entry_lower.endswith(audio_extensions)
                    or entry_lower.endswith(video_extensions)
                ):
                    return True
            if os.path.isdir(entry_path):
                if has_media_or_subfolders(entry_path):
                    return True
    except:
        pass

    return False


def scan_model_directory(base_dir, relative_path=""):
    """扫描模型目录"""
    current_dir = os.path.join(base_dir, relative_path) if relative_path else base_dir
    items = []

    if not os.path.exists(current_dir):
        return items

    for entry in os.listdir(current_dir):
        entry_path = os.path.join(current_dir, entry)
        entry_relative_path = (
            os.path.join(relative_path, entry) if relative_path else entry
        )

        if os.path.isdir(entry_path):
            if has_models_or_subfolders(entry_path):
                folder_preview_path = os.path.join(current_dir, f"{entry}.png")
                has_preview = os.path.exists(folder_preview_path)
                items.append(
                    {
                        "type": "folder",
                        "name": entry,
                        "path": entry_relative_path,
                        "has_preview": has_preview,
                    }
                )
        elif entry.endswith((".safetensors", ".pt", ".pth", ".bin", ".ckpt")):
            model_name = os.path.splitext(entry)[0]
            png_path = os.path.join(current_dir, f"{model_name}.png")
            has_preview = os.path.exists(png_path)
            metadata = load_pm_metadata(current_dir, model_name)
            items.append(
                {
                    "type": "model",
                    "name": entry,
                    "filename": entry,
                    "path": entry_relative_path,
                    "has_preview": has_preview,
                    "title": metadata.get("title", ""),
                    "metadata": metadata,
                }
            )

    items.sort(key=lambda x: (0 if x["type"] == "folder" else 1, x["name"]))
    return items


async def get_model_metadata(request):
    """获取模型元数据"""
    model_path = request.match_info.get("path", "")
    model_path = urllib.parse.unquote(model_path)

    pm_models_dir = get_pm_models_dir()
    full_path = os.path.join(pm_models_dir, model_path)

    if not os.path.exists(full_path):
        return web.Response(status=404, text="File not found")

    parent_dir = os.path.dirname(full_path)
    name_without_ext = os.path.splitext(os.path.basename(full_path))[0]
    if os.path.isdir(full_path):
        name_without_ext = os.path.basename(full_path)

    metadata = load_pm_metadata(parent_dir, name_without_ext)
    return web.json_response(metadata)


async def save_model_metadata(request):
    """保存模型元数据"""
    try:
        data = await request.json()
        model_path = data.get("path", "")
        metadata = data.get("metadata", {})

        if not model_path:
            return web.Response(status=400, text="Missing path")

        model_path = urllib.parse.unquote(model_path)
        pm_models_dir = get_pm_models_dir()
        full_path = os.path.join(pm_models_dir, model_path)

        if not os.path.exists(full_path):
            return web.Response(status=404, text="File not found")

        parent_dir = os.path.dirname(full_path)
        name_without_ext = os.path.splitext(os.path.basename(full_path))[0]
        if os.path.isdir(full_path):
            name_without_ext = os.path.basename(full_path)

        pm_path = os.path.join(parent_dir, f"{name_without_ext}.pm")

        with open(pm_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"Save metadata error: {e}")
        logger.error(traceback.format_exc())
        return web.Response(status=500, text=str(e))


async def get_model_info(request):
    """获取模型信息"""
    model_path = request.match_info.get("path", "")
    model_path = urllib.parse.unquote(model_path)

    pm_models_dir = get_pm_models_dir()
    full_path = os.path.join(pm_models_dir, model_path)

    if not os.path.exists(full_path):
        return web.Response(status=404, text="File not found")

    info = {}
    stat_info = os.stat(full_path)

    if os.path.isfile(full_path):
        info["type"] = "model"
        info["name"] = os.path.basename(full_path)
        info["path"] = model_path
        info["size_bytes"] = stat_info.st_size
        info["size"] = get_file_size(full_path)
        info["modified_time"] = datetime.fromtimestamp(stat_info.st_mtime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["created_time"] = datetime.fromtimestamp(stat_info.st_ctime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["extension"] = os.path.splitext(full_path)[1].lower()
    elif os.path.isdir(full_path):
        info["type"] = "folder"
        info["name"] = os.path.basename(full_path)
        info["path"] = model_path
        info["modified_time"] = datetime.fromtimestamp(stat_info.st_mtime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["created_time"] = datetime.fromtimestamp(stat_info.st_ctime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        file_count = 0
        total_size = 0
        for root, dirs, files in os.walk(full_path):
            file_count += len(files)
            for f in files:
                fp = os.path.join(root, f)
                if os.path.exists(fp):
                    total_size += os.path.getsize(fp)

        info["file_count"] = file_count
        info["size"] = get_file_size(full_path)

    if os.path.isfile(full_path):
        parent_dir = os.path.dirname(full_path)
        name_without_ext = os.path.splitext(os.path.basename(full_path))[0]
        metadata = load_pm_metadata(parent_dir, name_without_ext)
        info["title"] = metadata.get("title", "")
        info["metadata"] = metadata

    return web.json_response(info)


async def list_pm_models(request):
    """列出所有模型"""
    pm_models_dir = get_pm_models_dir()
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_model_directory(pm_models_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def get_pm_model_preview(request):
    """获取模型预览图"""
    model_path = request.match_info.get("path", "")
    model_path = urllib.parse.unquote(model_path)

    pm_models_dir = get_pm_models_dir()
    full_path = os.path.join(pm_models_dir, model_path)

    if os.path.exists(full_path):
        return web.FileResponse(full_path)

    # 尝试查找模型文件及其预览图
    lora_extensions = (".safetensors", ".pt", ".pth", ".bin", ".ckpt")
    found_model = None

    for root, dirs, files in os.walk(pm_models_dir):
        for file in files:
            if file.endswith(lora_extensions):
                # 检查模型名称是否匹配（不带扩展名）
                name_without_ext = os.path.splitext(file)[0]
                if name_without_ext == model_path or file == model_path:
                    found_model = os.path.join(root, file)
                    break
        if found_model:
            break

    if found_model:
        # 查找预览图
        parent_dir = os.path.dirname(found_model)
        name_without_ext = os.path.splitext(os.path.basename(found_model))[0]

        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            preview_path = os.path.join(parent_dir, f"{name_without_ext}{ext}")
            if os.path.exists(preview_path):
                return web.FileResponse(preview_path)

    return web.Response(status=404)


async def replace_model_preview(request):
    """替换模型预览图"""
    try:
        data = await request.post()

        item_path = data.get("path")
        image_file = data.get("image")

        if not item_path or not image_file:
            return web.Response(status=400, text="Missing path or image")

        image_data = image_file.file.read()

        item_path = urllib.parse.unquote(item_path)
        pm_models_dir = get_pm_models_dir()
        full_path = os.path.join(pm_models_dir, item_path)

        if not os.path.exists(full_path):
            return web.Response(status=404, text="Item not found")

        parent_dir = os.path.dirname(full_path)
        preview_path = None

        if os.path.isfile(full_path) and not full_path.endswith(".png"):
            name_without_ext = os.path.splitext(os.path.basename(full_path))[0]
            preview_path = os.path.join(parent_dir, f"{name_without_ext}.png")
        elif os.path.isdir(full_path):
            folder_name = os.path.basename(full_path)
            preview_path = os.path.join(parent_dir, f"{folder_name}.png")
        else:
            return web.Response(status=400, text="Invalid item type")

        with open(preview_path, "wb") as f:
            f.write(image_data)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"Replace preview error: {e}")
        logger.error(traceback.format_exc())
        return web.Response(status=500, text=str(e))


async def delete_pm_model(request):
    """删除模型"""
    model_path = request.match_info.get("path", "")
    model_path = urllib.parse.unquote(model_path)

    pm_models_dir = get_pm_models_dir()
    full_path = os.path.join(pm_models_dir, model_path)

    if os.path.exists(full_path):
        if os.path.isfile(full_path):
            os.remove(full_path)

            if not full_path.endswith(".png"):
                name_without_ext = os.path.splitext(os.path.basename(full_path))[0]
                png_path = os.path.join(
                    os.path.dirname(full_path), f"{name_without_ext}.png"
                )
                if os.path.exists(png_path):
                    os.remove(png_path)
                pm_path = os.path.join(
                    os.path.dirname(full_path), f"{name_without_ext}.pm"
                )
                if os.path.exists(pm_path):
                    os.remove(pm_path)
        elif os.path.isdir(full_path):
            import shutil

            shutil.rmtree(full_path)

            folder_preview_path = os.path.join(
                os.path.dirname(full_path), os.path.basename(full_path) + ".png"
            )
            if os.path.exists(folder_preview_path):
                os.remove(folder_preview_path)

    return web.json_response({"success": True})


async def rename_pm_model(request):
    """重命名模型"""
    try:
        data = await request.json()
        old_path = data.get("old_path", "")
        new_name = data.get("new_name", "")

        if not old_path or not new_name:
            return web.Response(status=400, text="Missing old_path or new_name")

        old_path = urllib.parse.unquote(old_path)
        pm_models_dir = get_pm_models_dir()
        old_full_path = os.path.join(pm_models_dir, old_path)

        if not os.path.exists(old_full_path):
            return web.Response(status=404, text="File or folder not found")

        parent_dir = os.path.dirname(old_full_path)
        new_full_path = os.path.join(parent_dir, new_name)

        if os.path.exists(new_full_path):
            return web.Response(status=400, text="New name already exists")

        if os.path.isfile(old_full_path) and not old_full_path.endswith(".png"):
            old_name_without_ext = os.path.splitext(os.path.basename(old_full_path))[0]
            new_name_without_ext = os.path.splitext(new_name)[0]

            old_png = os.path.join(parent_dir, f"{old_name_without_ext}.png")
            if os.path.exists(old_png):
                new_png = os.path.join(parent_dir, f"{new_name_without_ext}.png")
                os.rename(old_png, new_png)

            old_pm = os.path.join(parent_dir, f"{old_name_without_ext}.pm")
            if os.path.exists(old_pm):
                new_pm = os.path.join(parent_dir, f"{new_name_without_ext}.pm")
                os.rename(old_pm, new_pm)

        elif os.path.isdir(old_full_path):
            old_folder_name = os.path.basename(old_full_path)
            new_folder_name = new_name

            folder_old_png = os.path.join(parent_dir, f"{old_folder_name}.png")
            if os.path.exists(folder_old_png):
                folder_new_png = os.path.join(parent_dir, f"{new_folder_name}.png")
                os.rename(folder_old_png, folder_new_png)

        os.rename(old_full_path, new_full_path)
        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"Rename error: {e}")
        return web.Response(status=500, text=str(e))


async def new_model_folder(request):
    """创建新模型文件夹"""
    try:
        data = await request.json()
        path = data.get("path", "")
        name = data.get("name", "")

        if not name:
            return web.Response(status=400, text="Missing name")

        path = urllib.parse.unquote(path)
        pm_models_dir = get_pm_models_dir()
        target_dir = os.path.join(pm_models_dir, path) if path else pm_models_dir
        new_folder_path = os.path.join(target_dir, name)

        if os.path.exists(new_folder_path):
            return web.Response(status=400, text="Folder already exists")

        os.makedirs(new_folder_path)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"New folder error: {e}")
        return web.Response(status=500, text=str(e))


def scan_media_directory(base_dir, relative_path=""):
    """扫描媒体目录"""
    current_dir = os.path.join(base_dir, relative_path) if relative_path else base_dir
    items = []

    image_extensions = (
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".bmp",
        ".tiff",
        ".tif",
    )
    audio_extensions = (".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a")
    video_extensions = (".mp4", ".webm", ".avi", ".mov", ".mkv")

    if not os.path.exists(current_dir):
        return items

    def check_folder_content(folder_path):
        """检查文件夹包含的内容类型"""
        has_image = False
        has_audio = False
        has_video = False
        has_subfolder_with_content = False

        try:
            for sub_entry in os.listdir(folder_path):
                sub_entry_path = os.path.join(folder_path, sub_entry)
                if os.path.isfile(sub_entry_path):
                    sub_entry_lower = sub_entry.lower()
                    if sub_entry_lower.endswith(image_extensions):
                        has_image = True
                    elif sub_entry_lower.endswith(audio_extensions):
                        has_audio = True
                    elif sub_entry_lower.endswith(video_extensions):
                        has_video = True
                elif os.path.isdir(sub_entry_path):
                    # 递归检查子文件夹
                    sub_result = check_folder_content(sub_entry_path)
                    if (
                        sub_result["has_image"]
                        or sub_result["has_audio"]
                        or sub_result["has_video"]
                    ):
                        has_subfolder_with_content = True
                        has_image = has_image or sub_result["has_image"]
                        has_audio = has_audio or sub_result["has_audio"]
                        has_video = has_video or sub_result["has_video"]
        except:
            pass

        return {
            "has_image": has_image,
            "has_audio": has_audio,
            "has_video": has_video,
            "has_content": has_image
            or has_audio
            or has_video
            or has_subfolder_with_content,
        }

    for entry in os.listdir(current_dir):
        entry_path = os.path.join(current_dir, entry)
        entry_relative_path = (
            os.path.join(relative_path, entry) if relative_path else entry
        )

        if os.path.isdir(entry_path):
            folder_preview_path = os.path.join(current_dir, f".{entry}.png")
            has_preview = os.path.exists(folder_preview_path)

            # 检查文件夹是否有内容
            folder_content = check_folder_content(entry_path)

            items.append(
                {
                    "type": "folder",
                    "name": entry,
                    "path": entry_relative_path,
                    "has_preview": has_preview,
                    "has_content": folder_content["has_content"],
                    "has_image": folder_content["has_image"],
                    "has_audio": folder_content["has_audio"],
                    "has_video": folder_content["has_video"],
                }
            )
        elif entry.lower().endswith(image_extensions):
            items.append(
                {
                    "type": "image",
                    "name": entry,
                    "path": entry_relative_path,
                    "has_preview": True,
                }
            )
        elif entry.lower().endswith(audio_extensions):
            items.append(
                {
                    "type": "audio",
                    "name": entry,
                    "path": entry_relative_path,
                    "has_preview": False,
                }
            )
        elif entry.lower().endswith(video_extensions):
            items.append(
                {
                    "type": "video",
                    "name": entry,
                    "path": entry_relative_path,
                    "has_preview": False,
                }
            )

    items.sort(key=lambda x: (0 if x["type"] == "folder" else 1, x["name"]))
    return items


def scan_directory(base_dir, relative_path=""):
    """扫描目录（用于工作流）"""
    current_dir = os.path.join(base_dir, relative_path) if relative_path else base_dir
    items = []

    if not os.path.exists(current_dir):
        return items

    for entry in os.listdir(current_dir):
        entry_path = os.path.join(current_dir, entry)
        entry_relative_path = (
            os.path.join(relative_path, entry) if relative_path else entry
        )

        if os.path.isdir(entry_path):
            folder_preview_path = os.path.join(current_dir, f".{entry}.png")
            has_preview = os.path.exists(folder_preview_path)
            items.append(
                {
                    "type": "folder",
                    "name": entry,
                    "path": entry_relative_path,
                    "has_preview": has_preview,
                }
            )
        elif entry.endswith(".json"):
            workflow_name = entry[:-5]
            png_path = os.path.join(current_dir, f".{workflow_name}.png")

            has_preview = os.path.exists(png_path)

            items.append(
                {
                    "type": "workflow",
                    "name": workflow_name,
                    "filename": entry,
                    "path": entry_relative_path,
                    "has_preview": has_preview,
                }
            )

    items.sort(key=lambda x: (0 if x["type"] == "folder" else 1, x["name"]))
    return items


async def list_pm_workflows(request):
    """列出PM工作流"""
    user_id = get_user_id_from_request(request)
    pm_workflows_dir = get_pm_workflows_dir(user_id)
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_directory(pm_workflows_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def get_pm_workflow_preview(request):
    """获取工作流预览图"""
    user_id = get_user_id_from_request(request)
    workflow_path = request.match_info.get("path", "")
    workflow_path = urllib.parse.unquote(workflow_path)

    pm_workflows_dir = get_pm_workflows_dir(user_id)
    full_path = os.path.join(pm_workflows_dir, workflow_path)

    if os.path.exists(full_path):
        return web.FileResponse(full_path)
    else:
        return web.Response(status=404)


async def load_pm_workflow(request):
    """加载工作流"""
    user_id = get_user_id_from_request(request)
    workflow_path = request.match_info.get("path", "")
    workflow_path = urllib.parse.unquote(workflow_path)

    pm_workflows_dir = get_pm_workflows_dir(user_id)
    full_path = os.path.join(pm_workflows_dir, workflow_path)

    if os.path.exists(full_path):
        with open(full_path, "r", encoding="utf-8") as f:
            workflow_data = json.load(f)
        return web.json_response(workflow_data)
    else:
        return web.Response(status=404)


async def save_pm_workflow(request):
    """保存工作流"""
    user_id = get_user_id_from_request(request)
    data = await request.json()
    workflow_name = data.get("name", "")
    workflow_data = data.get("workflow", {})
    path = data.get("path", "")

    if not workflow_name:
        return web.Response(status=400, text="Missing workflow name")

    pm_workflows_dir = get_pm_workflows_dir(user_id)
    target_dir = os.path.join(pm_workflows_dir, path) if path else pm_workflows_dir
    os.makedirs(target_dir, exist_ok=True)

    json_path = os.path.join(target_dir, f"{workflow_name}.json")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(workflow_data, f, indent=2)

    return web.json_response({"success": True, "name": workflow_name})


async def delete_pm_workflow(request):
    """删除工作流"""
    user_id = get_user_id_from_request(request)
    workflow_path = request.match_info.get("path", "")
    workflow_path = urllib.parse.unquote(workflow_path)

    pm_workflows_dir = get_pm_workflows_dir(user_id)
    full_path = os.path.join(pm_workflows_dir, workflow_path)

    if os.path.exists(full_path):
        if os.path.isfile(full_path):
            os.remove(full_path)

            if workflow_path.endswith(".json"):
                png_path = full_path[:-5] + ".png"
                if os.path.exists(png_path):
                    os.remove(png_path)
                dot_png_path = os.path.join(
                    os.path.dirname(full_path),
                    "." + os.path.basename(full_path)[:-5] + ".png",
                )
                if os.path.exists(dot_png_path):
                    os.remove(dot_png_path)
        elif os.path.isdir(full_path):
            import shutil

            shutil.rmtree(full_path)

            folder_preview_path = os.path.join(
                os.path.dirname(full_path), "." + os.path.basename(full_path) + ".png"
            )
            if os.path.exists(folder_preview_path):
                os.remove(folder_preview_path)

    return web.json_response({"success": True})


async def rename_pm_workflow(request):
    """重命名工作流"""
    try:
        user_id = get_user_id_from_request(request)
        data = await request.json()
        old_path = data.get("old_path", "")
        new_name = data.get("new_name", "")

        if not old_path or not new_name:
            return web.Response(status=400, text="Missing old_path or new_name")

        old_path = urllib.parse.unquote(old_path)
        pm_workflows_dir = get_pm_workflows_dir(user_id)
        old_full_path = os.path.join(pm_workflows_dir, old_path)

        if not os.path.exists(old_full_path):
            return web.Response(status=404, text="File or folder not found")

        parent_dir = os.path.dirname(old_full_path)
        new_full_path = os.path.join(parent_dir, new_name)

        if os.path.exists(new_full_path):
            return web.Response(status=400, text="New name already exists")

        if os.path.isfile(old_full_path) and old_full_path.endswith(".json"):
            old_name_without_ext = os.path.basename(old_full_path)[:-5]
            new_name_without_ext = (
                new_name[:-5] if new_name.endswith(".json") else new_name
            )

            dot_old_png = os.path.join(parent_dir, f".{old_name_without_ext}.png")
            if os.path.exists(dot_old_png):
                dot_new_png = os.path.join(parent_dir, f".{new_name_without_ext}.png")
                os.rename(dot_old_png, dot_new_png)

        elif os.path.isdir(old_full_path):
            old_folder_name = os.path.basename(old_full_path)
            new_folder_name = new_name

            folder_dot_old_png = os.path.join(parent_dir, f".{old_folder_name}.png")
            if os.path.exists(folder_dot_old_png):
                folder_dot_new_png = os.path.join(parent_dir, f".{new_folder_name}.png")
                os.rename(folder_dot_old_png, folder_dot_new_png)

        os.rename(old_full_path, new_full_path)
        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"Rename error: {e}")
        return web.Response(status=500, text=str(e))


async def replace_preview(request):
    """替换预览图"""
    try:
        user_id = get_user_id_from_request(request)

        data = await request.post()

        item_path = data.get("path")
        image_file = data.get("image")

        if not item_path or not image_file:
            return web.Response(status=400, text="Missing path or image")

        image_data = image_file.file.read()

        item_path = urllib.parse.unquote(item_path)
        pm_workflows_dir = get_pm_workflows_dir(user_id)
        full_path = os.path.join(pm_workflows_dir, item_path)

        if not os.path.exists(full_path):
            return web.Response(status=404, text="Item not found")

        parent_dir = os.path.dirname(full_path)
        preview_path = None

        if os.path.isfile(full_path) and full_path.endswith(".json"):
            name_without_ext = os.path.basename(full_path)[:-5]
            preview_path = os.path.join(parent_dir, f".{name_without_ext}.png")
        elif os.path.isdir(full_path):
            folder_name = os.path.basename(full_path)
            preview_path = os.path.join(parent_dir, f".{folder_name}.png")
        else:
            return web.Response(status=400, text="Invalid item type")

        with open(preview_path, "wb") as f:
            f.write(image_data)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"Replace preview error: {e}")
        logger.error(traceback.format_exc())
        return web.Response(status=500, text=str(e))


async def new_folder(request):
    """创建新文件夹"""
    try:
        user_id = get_user_id_from_request(request)
        data = await request.json()
        path = data.get("path", "")
        name = data.get("name", "")

        if not name:
            return web.Response(status=400, text="Missing name")

        path = urllib.parse.unquote(path)
        pm_workflows_dir = get_pm_workflows_dir(user_id)
        target_dir = os.path.join(pm_workflows_dir, path) if path else pm_workflows_dir
        new_folder_path = os.path.join(target_dir, name)

        if os.path.exists(new_folder_path):
            return web.Response(status=400, text="Folder already exists")

        os.makedirs(new_folder_path)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"New folder error: {e}")
        return web.Response(status=500, text=str(e))


async def new_workflow(request):
    """创建新工作流"""
    try:
        user_id = get_user_id_from_request(request)
        data = await request.json()
        path = data.get("path", "")
        name = data.get("name", "")

        if not name:
            return web.Response(status=400, text="Missing name")

        path = urllib.parse.unquote(path)
        pm_workflows_dir = get_pm_workflows_dir(user_id)
        target_dir = os.path.join(pm_workflows_dir, path) if path else pm_workflows_dir
        new_workflow_path = os.path.join(target_dir, name)

        if os.path.exists(new_workflow_path):
            return web.Response(status=400, text="Workflow already exists")

        os.makedirs(target_dir, exist_ok=True)

        workflow_name = name
        if workflow_name.endswith(".json"):
            workflow_name = workflow_name[:-5]

        # 创建空工作流结构
        empty_workflow = {
            "nodes": [],
            "links": [],
            "groups": [],
            "config": {},
            "extra": {
                "workflow_name": workflow_name,
                "workflow_path": os.path.join(path, name) if path else name,
            },
        }

        with open(new_workflow_path, "w", encoding="utf-8") as f:
            json.dump(empty_workflow, f, indent=2)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"New workflow error: {e}")
        return web.Response(status=500, text=str(e))


async def list_pm_input(request):
    """列出输入目录内容"""
    pm_input_dir = get_pm_input_dir()
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_media_directory(pm_input_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def list_pm_output(request):
    """列出输出目录内容"""
    pm_output_dir = get_pm_output_dir()
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_media_directory(pm_output_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def get_pm_input_preview(request):
    """获取输入文件预览"""
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_input_dir = get_pm_input_dir()
    full_path = os.path.join(pm_input_dir, media_path)

    if os.path.exists(full_path):
        return web.FileResponse(full_path)
    else:
        return web.Response(status=404)


async def get_pm_output_preview(request):
    """获取输出文件预览"""
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_output_dir = get_pm_output_dir()
    full_path = os.path.join(pm_output_dir, media_path)

    if os.path.exists(full_path):
        return web.FileResponse(full_path)
    else:
        return web.Response(status=404)


async def delete_pm_input(request):
    """删除输入文件"""
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_input_dir = get_pm_input_dir()
    full_path = os.path.join(pm_input_dir, media_path)

    if os.path.exists(full_path):
        if os.path.isfile(full_path):
            os.remove(full_path)
        elif os.path.isdir(full_path):
            import shutil

            shutil.rmtree(full_path)

    return web.json_response({"success": True})


async def delete_pm_output(request):
    """删除输出文件"""
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_output_dir = get_pm_output_dir()
    full_path = os.path.join(pm_output_dir, media_path)

    if os.path.exists(full_path):
        if os.path.isfile(full_path):
            os.remove(full_path)
        elif os.path.isdir(full_path):
            import shutil

            shutil.rmtree(full_path)

    return web.json_response({"success": True})


async def rename_pm_input(request):
    """重命名输入文件"""
    try:
        data = await request.json()
        old_path = data.get("old_path", "")
        new_name = data.get("new_name", "")

        if not old_path or not new_name:
            return web.Response(status=400, text="Missing old_path or new_name")

        old_path = urllib.parse.unquote(old_path)
        pm_input_dir = get_pm_input_dir()
        old_full_path = os.path.join(pm_input_dir, old_path)

        if not os.path.exists(old_full_path):
            return web.Response(status=404, text="File or folder not found")

        parent_dir = os.path.dirname(old_full_path)
        new_full_path = os.path.join(parent_dir, new_name)

        if os.path.exists(new_full_path):
            return web.Response(status=400, text="New name already exists")

        os.rename(old_full_path, new_full_path)
        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"Rename error: {e}")
        return web.Response(status=500, text=str(e))


async def rename_pm_output(request):
    """重命名输出文件"""
    try:
        data = await request.json()
        old_path = data.get("old_path", "")
        new_name = data.get("new_name", "")

        if not old_path or not new_name:
            return web.Response(status=400, text="Missing old_path or new_name")

        old_path = urllib.parse.unquote(old_path)
        pm_output_dir = get_pm_output_dir()
        old_full_path = os.path.join(pm_output_dir, old_path)

        if not os.path.exists(old_full_path):
            return web.Response(status=404, text="File or folder not found")

        parent_dir = os.path.dirname(old_full_path)
        new_full_path = os.path.join(parent_dir, new_name)

        if os.path.exists(new_full_path):
            return web.Response(status=400, text="New name already exists")

        os.rename(old_full_path, new_full_path)
        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"Rename error: {e}")
        return web.Response(status=500, text=str(e))


async def new_input_folder(request):
    """在输入目录创建新文件夹"""
    try:
        data = await request.json()
        path = data.get("path", "")
        name = data.get("name", "")

        if not name:
            return web.Response(status=400, text="Missing name")

        path = urllib.parse.unquote(path)
        pm_input_dir = get_pm_input_dir()
        target_dir = os.path.join(pm_input_dir, path) if path else pm_input_dir
        new_folder_path = os.path.join(target_dir, name)

        if os.path.exists(new_folder_path):
            return web.Response(status=400, text="Folder already exists")

        os.makedirs(new_folder_path)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"New folder error: {e}")
        return web.Response(status=500, text=str(e))


async def new_output_folder(request):
    """在输出目录创建新文件夹"""
    try:
        data = await request.json()
        path = data.get("path", "")
        name = data.get("name", "")

        if not name:
            return web.Response(status=400, text="Missing name")

        path = urllib.parse.unquote(path)
        pm_output_dir = get_pm_output_dir()
        target_dir = os.path.join(pm_output_dir, path) if path else pm_output_dir
        new_folder_path = os.path.join(target_dir, name)

        if os.path.exists(new_folder_path):
            return web.Response(status=400, text="Folder already exists")

        os.makedirs(new_folder_path)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"New folder error: {e}")
        return web.Response(status=500, text=str(e))


async def get_pm_input_info(request):
    """获取输入文件信息"""
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_input_dir = get_pm_input_dir()
    full_path = os.path.join(pm_input_dir, media_path)

    if not os.path.exists(full_path):
        return web.Response(status=404, text="File not found")

    info = {}
    stat_info = os.stat(full_path)

    if os.path.isfile(full_path):
        info["type"] = "file"
        info["name"] = os.path.basename(full_path)
        info["path"] = media_path
        info["size_bytes"] = stat_info.st_size
        info["size"] = get_file_size(full_path)
        info["modified_time"] = datetime.fromtimestamp(stat_info.st_mtime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["created_time"] = datetime.fromtimestamp(stat_info.st_ctime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["extension"] = os.path.splitext(full_path)[1].lower()
    elif os.path.isdir(full_path):
        info["type"] = "folder"
        info["name"] = os.path.basename(full_path)
        info["path"] = media_path
        info["modified_time"] = datetime.fromtimestamp(stat_info.st_mtime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["created_time"] = datetime.fromtimestamp(stat_info.st_ctime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        file_count = 0
        total_size = 0
        for root, dirs, files in os.walk(full_path):
            file_count += len(files)
            for f in files:
                fp = os.path.join(root, f)
                if os.path.exists(fp):
                    total_size += os.path.getsize(fp)

        info["file_count"] = file_count

    return web.json_response(info)


async def get_pm_output_info(request):
    """获取输出文件信息"""
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_output_dir = get_pm_output_dir()
    full_path = os.path.join(pm_output_dir, media_path)

    if not os.path.exists(full_path):
        return web.Response(status=404, text="File not found")

    info = {}
    stat_info = os.stat(full_path)

    if os.path.isfile(full_path):
        info["type"] = "file"
        info["name"] = os.path.basename(full_path)
        info["path"] = media_path
        info["size_bytes"] = stat_info.st_size
        info["size"] = get_file_size(full_path)
        info["modified_time"] = datetime.fromtimestamp(stat_info.st_mtime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["created_time"] = datetime.fromtimestamp(stat_info.st_ctime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["extension"] = os.path.splitext(full_path)[1].lower()
    elif os.path.isdir(full_path):
        info["type"] = "folder"
        info["name"] = os.path.basename(full_path)
        info["path"] = media_path
        info["modified_time"] = datetime.fromtimestamp(stat_info.st_mtime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        info["created_time"] = datetime.fromtimestamp(stat_info.st_ctime).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        file_count = 0
        total_size = 0
        for root, dirs, files in os.walk(full_path):
            file_count += len(files)
            for f in files:
                fp = os.path.join(root, f)
                if os.path.exists(fp):
                    total_size += os.path.getsize(fp)

        info["file_count"] = file_count

    return web.json_response(info)


def setup_routes():
    """设置所有路由"""
    from server import PromptServer

    @PromptServer.instance.routes.get("/pm_workflow/list")
    async def list_workflows_route(request):
        return await list_pm_workflows(request)

    @PromptServer.instance.routes.get("/pm_workflow/preview/{path:.*}")
    async def get_preview_route(request):
        return await get_pm_workflow_preview(request)

    @PromptServer.instance.routes.get("/pm_workflow/load/{path:.*}")
    async def load_workflow_route(request):
        return await load_pm_workflow(request)

    @PromptServer.instance.routes.post("/pm_workflow/save")
    async def save_workflow_route(request):
        return await save_pm_workflow(request)

    @PromptServer.instance.routes.delete("/pm_workflow/delete/{path:.*}")
    async def delete_workflow_route(request):
        return await delete_pm_workflow(request)

    @PromptServer.instance.routes.post("/pm_workflow/rename")
    async def rename_workflow_route(request):
        return await rename_pm_workflow(request)

    @PromptServer.instance.routes.post("/pm_workflow/replace_preview")
    async def replace_preview_route(request):
        return await replace_preview(request)

    @PromptServer.instance.routes.post("/pm_workflow/new_folder")
    async def new_folder_route(request):
        return await new_folder(request)

    @PromptServer.instance.routes.post("/pm_workflow/new_workflow")
    async def new_workflow_route(request):
        return await new_workflow(request)

    @PromptServer.instance.routes.get("/pm_model/list")
    async def list_models_route(request):
        return await list_pm_models(request)

    @PromptServer.instance.routes.get("/pm_model/info/{path:.*}")
    async def get_model_info_route(request):
        return await get_model_info(request)

    @PromptServer.instance.routes.get("/pm_model/preview/{path:.*}")
    async def get_model_preview_route(request):
        return await get_pm_model_preview(request)

    @PromptServer.instance.routes.post("/pm_model/replace_preview")
    async def replace_model_preview_route(request):
        return await replace_model_preview(request)

    @PromptServer.instance.routes.delete("/pm_model/delete/{path:.*}")
    async def delete_model_route(request):
        return await delete_pm_model(request)

    @PromptServer.instance.routes.post("/pm_model/rename")
    async def rename_model_route(request):
        return await rename_pm_model(request)

    @PromptServer.instance.routes.post("/pm_model/new_folder")
    async def new_model_folder_route(request):
        return await new_model_folder(request)

    @PromptServer.instance.routes.get("/pm_model/metadata/{path:.*}")
    async def get_model_metadata_route(request):
        return await get_model_metadata(request)

    @PromptServer.instance.routes.post("/pm_model/save_metadata")
    async def save_model_metadata_route(request):
        return await save_model_metadata(request)

    @PromptServer.instance.routes.get("/pm_input/list")
    async def list_input_route(request):
        return await list_pm_input(request)

    @PromptServer.instance.routes.get("/pm_input/preview/{path:.*}")
    async def get_input_preview_route(request):
        return await get_pm_input_preview(request)

    @PromptServer.instance.routes.get("/pm_input/info/{path:.*}")
    async def get_input_info_route(request):
        return await get_pm_input_info(request)

    @PromptServer.instance.routes.delete("/pm_input/delete/{path:.*}")
    async def delete_input_route(request):
        return await delete_pm_input(request)

    @PromptServer.instance.routes.post("/pm_input/rename")
    async def rename_input_route(request):
        return await rename_pm_input(request)

    @PromptServer.instance.routes.post("/pm_input/new_folder")
    async def new_input_folder_route(request):
        return await new_input_folder(request)

    @PromptServer.instance.routes.get("/pm_output/list")
    async def list_output_route(request):
        return await list_pm_output(request)

    @PromptServer.instance.routes.get("/pm_output/preview/{path:.*}")
    async def get_output_preview_route(request):
        return await get_pm_output_preview(request)

    @PromptServer.instance.routes.get("/pm_output/info/{path:.*}")
    async def get_output_info_route(request):
        return await get_pm_output_info(request)

    @PromptServer.instance.routes.delete("/pm_output/delete/{path:.*}")
    async def delete_output_route(request):
        return await delete_pm_output(request)

    @PromptServer.instance.routes.post("/pm_output/rename")
    async def rename_output_route(request):
        return await rename_pm_output(request)

    @PromptServer.instance.routes.post("/pm_output/new_folder")
    async def new_output_folder_route(request):
        return await new_output_folder(request)

    @PromptServer.instance.routes.get("/pm_output/metadata/{path:.*}")
    async def get_output_metadata_route(request):
        return await get_pm_output_metadata(request)


async def get_pm_output_metadata(request):
    """获取输出文件的元数据（用于图像文件）"""
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_output_dir = get_pm_output_dir()
    full_path = os.path.join(pm_output_dir, media_path)

    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        return web.Response(status=404, text="File not found")

    ext = os.path.splitext(full_path)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp", ".gif"]:
        return web.Response(status=400, text="Not an image file")

    try:
        metadata = {}

        if ext == ".png":
            with Image.open(full_path) as img:
                png_info = img.info
                if "prompt" in png_info:
                    try:
                        metadata["prompt"] = json.loads(png_info["prompt"])
                    except:
                        metadata["prompt"] = png_info["prompt"]

        return web.json_response(metadata)
    except Exception as e:
        return web.Response(status=500, text=str(e))


setup_routes()
