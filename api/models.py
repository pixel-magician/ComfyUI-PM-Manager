import os
import json
import logging
import traceback
from datetime import datetime
import folder_paths
import urllib.parse
from aiohttp import web

from ..utils.helpers import (
    get_file_size,
    load_pm_metadata,
    has_models_or_subfolders,
)

logger = logging.getLogger(__name__)


def get_pm_models_dir():
    return folder_paths.models_dir


def scan_model_directory(base_dir, relative_path=""):
    current_dir = os.path.join(base_dir, relative_path) if relative_path else base_dir
    items = []

    if not os.path.exists(current_dir):
        return items

    for entry in os.listdir(current_dir):
        entry_path = os.path.join(current_dir, entry)
        # Use forward slashes for cross-platform compatibility
        entry_relative_path = (
            relative_path.replace('\\', '/') + '/' + entry if relative_path else entry
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
    pm_models_dir = get_pm_models_dir()
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_model_directory(pm_models_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def get_pm_model_preview(request):
    model_path = request.match_info.get("path", "")
    model_path = urllib.parse.unquote(model_path)

    pm_models_dir = get_pm_models_dir()
    full_path = os.path.join(pm_models_dir, model_path)

    if os.path.exists(full_path):
        return web.FileResponse(full_path)

    lora_extensions = (".safetensors", ".pt", ".pth", ".bin", ".ckpt")
    found_model = None

    # Normalize model_path to use forward slashes for comparison
    model_path_normalized = model_path.replace('\\', '/')
    model_path_parts = model_path_normalized.split('/')
    model_name_only = model_path_parts[-1] if model_path_parts else model_path_normalized

    for root, dirs, files in os.walk(pm_models_dir):
        for file in files:
            if file.endswith(lora_extensions):
                name_without_ext = os.path.splitext(file)[0]
                # Check if model_path matches just the filename or the full relative path
                if (name_without_ext == model_path or 
                    file == model_path or
                    name_without_ext == model_name_only or
                    file == model_name_only):
                    found_model = os.path.join(root, file)
                    break
                # Also check if the relative path from pm_models_dir matches
                full_file_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_file_path, pm_models_dir)
                rel_path_normalized = rel_path.replace('\\', '/')
                rel_path_without_ext = os.path.splitext(rel_path_normalized)[0]
                if rel_path_normalized == model_path_normalized or rel_path_without_ext == model_path_normalized:
                    found_model = full_file_path
                    break
        if found_model:
            break

    if found_model:
        parent_dir = os.path.dirname(found_model)
        name_without_ext = os.path.splitext(os.path.basename(found_model))[0]

        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            preview_path = os.path.join(parent_dir, f"{name_without_ext}{ext}")
            if os.path.exists(preview_path):
                return web.FileResponse(preview_path)

    return web.Response(status=404)


async def replace_model_preview(request):
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
