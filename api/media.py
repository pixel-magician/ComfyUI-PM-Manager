import os
import json
import logging
import folder_paths
import urllib.parse
from aiohttp import web
from PIL import Image

from ..utils.helpers import (
    get_file_size,
    has_media_or_subfolders,
    get_file_info,
)

logger = logging.getLogger(__name__)


def get_pm_input_dir():
    return folder_paths.get_input_directory()


def get_pm_output_dir():
    return folder_paths.get_output_directory()


def scan_media_directory(base_dir, relative_path=""):
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
                    sub_result = check_folder_content(sub_entry_path)
                    if sub_result["has_image"] or sub_result["has_audio"] or sub_result["has_video"]:
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
            "has_content": has_image or has_audio or has_video or has_subfolder_with_content
        }

    for entry in os.listdir(current_dir):
        entry_path = os.path.join(current_dir, entry)
        entry_relative_path = (
            os.path.join(relative_path, entry) if relative_path else entry
        )

        if os.path.isdir(entry_path):
            folder_preview_path = os.path.join(current_dir, f".{entry}.png")
            has_preview = os.path.exists(folder_preview_path)

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


# ============ Input APIs ============

async def list_pm_input(request):
    pm_input_dir = get_pm_input_dir()
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_media_directory(pm_input_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def get_pm_input_preview(request):
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_input_dir = get_pm_input_dir()
    full_path = os.path.join(pm_input_dir, media_path)

    if os.path.exists(full_path):
        return web.FileResponse(full_path)
    else:
        return web.Response(status=404)


async def get_pm_input_info(request):
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_input_dir = get_pm_input_dir()
    full_path = os.path.join(pm_input_dir, media_path)

    if not os.path.exists(full_path):
        return web.Response(status=404, text="File not found")

    info = get_file_info(full_path, media_path)
    return web.json_response(info)


async def delete_pm_input(request):
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


async def rename_pm_input(request):
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


async def new_input_folder(request):
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


# ============ Output APIs ============

async def list_pm_output(request):
    pm_output_dir = get_pm_output_dir()
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_media_directory(pm_output_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def get_pm_output_preview(request):
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_output_dir = get_pm_output_dir()
    full_path = os.path.join(pm_output_dir, media_path)

    if os.path.exists(full_path):
        return web.FileResponse(full_path)
    else:
        return web.Response(status=404)


async def get_pm_output_info(request):
    media_path = request.match_info.get("path", "")
    media_path = urllib.parse.unquote(media_path)

    pm_output_dir = get_pm_output_dir()
    full_path = os.path.join(pm_output_dir, media_path)

    if not os.path.exists(full_path):
        return web.Response(status=404, text="File not found")

    info = get_file_info(full_path, media_path)
    return web.json_response(info)


async def delete_pm_output(request):
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


async def rename_pm_output(request):
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


async def new_output_folder(request):
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


async def get_pm_output_metadata(request):
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
