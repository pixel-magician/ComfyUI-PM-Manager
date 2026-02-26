import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def get_file_size(file_path):
    size_bytes = os.path.getsize(file_path)
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def load_pm_metadata(current_dir, name_without_ext):
    pm_path = os.path.join(current_dir, f"{name_without_ext}.pm")
    metadata = {}
    if os.path.exists(pm_path):
        try:
            with open(pm_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except:
            pass
    return metadata


def save_pm_metadata(current_dir, name_without_ext, metadata):
    pm_path = os.path.join(current_dir, f"{name_without_ext}.pm")
    try:
        with open(pm_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Save metadata error: {e}")
        return False


def has_models_or_subfolders(dir_path):
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


def get_file_info(full_path, relative_path=""):
    info = {}
    stat_info = os.stat(full_path)

    if os.path.isfile(full_path):
        info["type"] = "file"
        info["name"] = os.path.basename(full_path)
        info["path"] = relative_path
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
        info["path"] = relative_path
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

    return info
