import os
import json
import logging
import traceback
import folder_paths
import urllib.parse
from aiohttp import web

from ..utils.helpers import get_file_size

logger = logging.getLogger(__name__)


def get_user_id_from_request(request):
    from comfy.cli_args import args

    user = "default"

    try:
        if args.multi_user and "comfy-user" in request.headers:
            user = request.headers["comfy-user"]

            if user.startswith(folder_paths.SYSTEM_USER_PREFIX):
                user = "default"

        from server import PromptServer

        if PromptServer.instance and hasattr(PromptServer.instance, "user_manager"):
            try:
                users = PromptServer.instance.user_manager.users
                if user in users:
                    return user

                if len(users) > 0:
                    first_user = next(iter(users.keys()))
                    return first_user
            except:
                pass
    except:
        pass

    return user


def get_pm_workflows_dir(user_id="default"):
    user_dir = folder_paths.get_user_directory()
    user_workflow_dir = os.path.join(user_dir, user_id, "workflows")
    os.makedirs(user_workflow_dir, exist_ok=True)
    return user_workflow_dir


def scan_directory(base_dir, relative_path=""):
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
    user_id = get_user_id_from_request(request)
    pm_workflows_dir = get_pm_workflows_dir(user_id)
    path = request.rel_url.query.get("path", "")
    path = urllib.parse.unquote(path)

    items = scan_directory(pm_workflows_dir, path)

    return web.json_response({"items": items, "current_path": path})


async def get_pm_workflow_preview(request):
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

    return web.json_response({"success": True})


async def delete_pm_workflow(request):
    user_id = get_user_id_from_request(request)
    workflow_path = request.match_info.get("path", "")
    workflow_path = urllib.parse.unquote(workflow_path)

    pm_workflows_dir = get_pm_workflows_dir(user_id)
    full_path = os.path.join(pm_workflows_dir, workflow_path)

    if os.path.exists(full_path):
        if os.path.isfile(full_path):
            os.remove(full_path)

            workflow_name = os.path.splitext(os.path.basename(full_path))[0]
            png_path = os.path.join(
                os.path.dirname(full_path), f".{workflow_name}.png"
            )
            if os.path.exists(png_path):
                os.remove(png_path)
        elif os.path.isdir(full_path):
            import shutil

            shutil.rmtree(full_path)

    return web.json_response({"success": True})


async def rename_pm_workflow(request):
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
        old_name_without_ext = os.path.splitext(os.path.basename(old_full_path))[0]
        new_name_without_ext = os.path.splitext(new_name)[0]

        old_png = os.path.join(parent_dir, f".{old_name_without_ext}.png")
        if os.path.exists(old_png):
            new_png = os.path.join(parent_dir, f".{new_name_without_ext}.png")
            os.rename(old_png, new_png)

    os.rename(old_full_path, new_full_path)
    return web.json_response({"success": True})


async def replace_preview(request):
    try:
        data = await request.post()

        item_path = data.get("path")
        image_file = data.get("image")

        if not item_path or not image_file:
            return web.Response(status=400, text="Missing path or image")

        image_data = image_file.file.read()

        item_path = urllib.parse.unquote(item_path)
        pm_workflows_dir = get_pm_workflows_dir()
        full_path = os.path.join(pm_workflows_dir, item_path)

        if not os.path.exists(full_path):
            return web.Response(status=404, text="Item not found")

        parent_dir = os.path.dirname(full_path)
        preview_path = None

        if os.path.isfile(full_path) and full_path.endswith(".json"):
            name_without_ext = os.path.splitext(os.path.basename(full_path))[0]
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
    try:
        data = await request.json()
        path = data.get("path", "")
        name = data.get("name", "")

        if not name:
            return web.Response(status=400, text="Missing name")

        path = urllib.parse.unquote(path)
        pm_workflows_dir = get_pm_workflows_dir()
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
    try:
        data = await request.json()
        path = data.get("path", "")
        name = data.get("name", "")

        if not name:
            return web.Response(status=400, text="Missing name")

        path = urllib.parse.unquote(path)
        pm_workflows_dir = get_pm_workflows_dir()
        target_dir = os.path.join(pm_workflows_dir, path) if path else pm_workflows_dir
        json_path = os.path.join(target_dir, f"{name}.json")

        if os.path.exists(json_path):
            return web.Response(status=400, text="Workflow already exists")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({}, f, indent=2)

        return web.json_response({"success": True})
    except Exception as e:
        logger.error(f"New workflow error: {e}")
        return web.Response(status=500, text=str(e))
