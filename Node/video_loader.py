import os
import itertools
import numpy as np
import torch
from PIL import Image, ImageOps
import cv2
import psutil
import subprocess
import re
import time
import hashlib
import shutil
import logging
import sys
import copy
from typing import Iterable, Union
from collections.abc import Mapping
import functools

import folder_paths
from comfy.utils import common_upscale, ProgressBar
import nodes
from comfy.k_diffusion.utils import FolderOfImages

try:
    from comfy_api.latest import InputImpl

    HAS_COMFY_API = True
except ImportError:
    HAS_COMFY_API = False


# ==================== 日志配置 ====================
class ColoredFormatter(logging.Formatter):
    """带颜色的日志格式化器"""

    COLORS = {
        "DEBUG": "\033[0;36m",
        "INFO": "\033[0;32m",
        "WARNING": "\033[0;33m",
        "ERROR": "\033[0;31m",
        "CRITICAL": "\033[0;37;41m",
        "RESET": "\033[0m",
    }

    def format(self, record):
        colored_record = copy.copy(record)
        levelname = colored_record.levelname
        seq = self.COLORS.get(levelname, self.COLORS["RESET"])
        colored_record.levelname = f"{seq}{levelname}{self.COLORS['RESET']}"
        return super().format(colored_record)


logger = logging.getLogger("PM-Video-Loader")
logger.propagate = False

if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ColoredFormatter("[%(name)s] - %(levelname)s - %(message)s"))
    logger.addHandler(handler)

loglevel = logging.INFO
logger.setLevel(loglevel)

# ==================== 常量定义 ====================
BIGMIN = -(2**53 - 1)  # 最小大整数
BIGMAX = 2**53 - 1  # 最大大整数
DIMMAX = 8192  # 最大维度
ENCODE_ARGS = ("utf-8", "backslashreplace")  # 编码参数
video_extensions = ["webm", "mp4", "mkv", "gif", "mov"]  # 支持的视频格式


# ==================== 工具类 ====================
class MultiInput(str):
    """多类型输入类 - 允许接受多种类型的输入"""

    def __new__(cls, string, allowed_types="*"):
        res = super().__new__(cls, string)
        res.allowed_types = allowed_types
        return res

    def __ne__(self, other):
        if self.allowed_types == "*" or other == "*":
            return False
        return other not in self.allowed_types


floatOrInt = MultiInput("FLOAT", ["FLOAT", "INT"])  # 浮点数或整数输入


class ContainsAll(dict):
    """包含所有键的字典类"""

    def __contains__(self, other):
        return True

    def __getitem__(self, key):
        return super().get(key, (None, {}))


class LazyAudioMap(Mapping):
    """延迟加载的音频映射类"""

    def __init__(self, file, start_time, duration):
        self.file = file
        self.start_time = start_time
        self.duration = duration
        self._dict = None

    def __getitem__(self, key):
        if self._dict is None:
            self._dict = get_audio(self.file, self.start_time, self.duration)
        return self._dict[key]

    def __iter__(self):
        if self._dict is None:
            self._dict = get_audio(self.file, self.start_time, self.duration)
        return iter(self._dict)

    def __len__(self):
        if self._dict is None:
            self._dict = get_audio(self.file, self.start_time, self.duration)
        return len(self._dict)


# ==================== FFmpeg路径处理 ====================
def ffmpeg_suitability(path):
    """评估FFmpeg版本的适用性得分"""
    try:
        version = subprocess.run(
            [path, "-version"], check=True, capture_output=True
        ).stdout.decode(*ENCODE_ARGS)
    except:
        return 0
    score = 0
    # 根据支持的编解码器评分
    simple_criterion = [
        ("libvpx", 20),
        ("264", 10),
        ("265", 3),
        ("svtav1", 5),
        ("libopus", 1),
    ]
    for criterion in simple_criterion:
        if version.find(criterion[0]) >= 0:
            score += criterion[1]
    # 根据版权年份评分
    copyright_index = version.find("2000-2")
    if copyright_index >= 0:
        copyright_year = version[copyright_index + 6 : copyright_index + 9]
        if copyright_year.isnumeric():
            score += int(copyright_year)
    return score


# 检测FFmpeg路径
if "VHS_FORCE_FFMPEG_PATH" in os.environ:
    ffmpeg_path = os.environ.get("VHS_FORCE_FFMPEG_PATH")
else:
    ffmpeg_paths = []
    try:
        from imageio_ffmpeg import get_ffmpeg_exe

        imageio_ffmpeg_path = get_ffmpeg_exe()
        ffmpeg_paths.append(imageio_ffmpeg_path)
    except:
        if "VHS_USE_IMAGEIO_FFMPEG" in os.environ:
            raise
        logger.warn("Failed to import imageio_ffmpeg")
    if "VHS_USE_IMAGEIO_FFMPEG" in os.environ:
        ffmpeg_path = imageio_ffmpeg_path
    else:
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg is not None:
            ffmpeg_paths.append(system_ffmpeg)
        if os.path.isfile("ffmpeg"):
            ffmpeg_paths.append(os.path.abspath("ffmpeg"))
        if os.path.isfile("ffmpeg.exe"):
            ffmpeg_paths.append(os.path.abspath("ffmpeg.exe"))
        if len(ffmpeg_paths) == 0:
            logger.error("No valid ffmpeg found.")
            ffmpeg_path = None
        elif len(ffmpeg_paths) == 1:
            ffmpeg_path = ffmpeg_paths[0]
        else:
            ffmpeg_path = max(ffmpeg_paths, key=ffmpeg_suitability)


# ==================== 工具函数 ====================
def is_gif(filename) -> bool:
    """检查文件是否为GIF格式"""
    file_parts = filename.split(".")
    return len(file_parts) > 1 and file_parts[-1] == "gif"


def target_size(
    width, height, custom_width, custom_height, downscale_ratio=8
) -> tuple[int, int]:
    """计算目标尺寸，支持自定义宽高和降采样"""
    if downscale_ratio is None:
        downscale_ratio = 8
    if custom_width == 0 and custom_height == 0:
        pass
    elif custom_height == 0:
        height *= custom_width / width
        width = custom_width
    elif custom_width == 0:
        width *= custom_height / height
        height = custom_height
    else:
        width = custom_width
        height = custom_height
    width = int(width / downscale_ratio + 0.5) * downscale_ratio
    height = int(height / downscale_ratio + 0.5) * downscale_ratio
    return (width, height)


# ==================== 文件/路径工具 ====================
def strip_path(path):
    """清理路径字符串（去除引号等）"""
    path = path.strip()
    if path.startswith('"'):
        path = path[1:]
    if path.endswith('"'):
        path = path[:-1]
    return path


def calculate_file_hash(filename: str, hash_every_n: int = 1):
    """计算文件哈希值"""
    h = hashlib.sha256()
    h.update(filename.encode())
    h.update(str(os.path.getmtime(filename)).encode())
    return h.hexdigest()


def hash_path(path):
    """计算路径哈希"""
    if path is None:
        return "input"
    if is_url(path):
        return "url"
    if not os.path.isfile(path):
        return "DNE"
    return calculate_file_hash(strip_path(path))


def is_url(url):
    """检查是否为URL"""
    return url.split("://")[0] in ["http", "https"]


def is_safe_path(path, strict=False):
    """检查路径是否安全"""
    if "VHS_STRICT_PATHS" not in os.environ and not strict:
        return True
    basedir = os.path.abspath(".")
    try:
        common_path = os.path.commonpath([basedir, path])
    except:
        return False
    return common_path == basedir


def validate_path(path, allow_none=False, allow_url=True):
    """验证路径有效性"""
    if path is None:
        return allow_none
    if is_url(path):
        if not allow_url:
            return "URLs are unsupported for this path"
        return is_safe_path(path)
    if not os.path.isfile(strip_path(path)):
        return "Invalid file path: {}".format(path)
    return is_safe_path(path)


# ==================== 音频工具 ====================
def get_audio(file, start_time=0, duration=0):
    """使用FFmpeg提取音频"""
    args = [ffmpeg_path, "-i", file]
    if start_time > 0:
        args += ["-ss", str(start_time)]
    if duration > 0:
        args += ["-t", str(duration)]
    try:
        res = subprocess.run(
            args + ["-f", "f32le", "-"], capture_output=True, check=True
        )
        audio = torch.frombuffer(bytearray(res.stdout), dtype=torch.float32)
        match = re.search(", (\\d+) Hz, (\\w+), ", res.stderr.decode(*ENCODE_ARGS))
    except subprocess.CalledProcessError as e:
        raise Exception(
            f"Failed to extract audio from {file}:\n" + e.stderr.decode(*ENCODE_ARGS)
        )
    if match:
        ar = int(match.group(1))
        ac = {"mono": 1, "stereo": 2}[match.group(2)]
    else:
        ar = 44100
        ac = 2
    audio = audio.reshape((-1, ac)).transpose(0, 1).unsqueeze(0)
    return {"waveform": audio, "sample_rate": ar}


def lazy_get_audio(file, start_time=0, duration=0, **kwargs):
    """延迟获取音频"""
    return LazyAudioMap(file, start_time, duration)


# ==================== 帧生成器 ====================
def cv_frame_generator(
    video, force_rate, frame_load_cap, skip_first_frames, select_every_nth
):
    """使用OpenCV生成视频帧"""
    video_cap = cv2.VideoCapture(video)
    if not video_cap.isOpened() or not video_cap.grab():
        raise ValueError(f"{video} could not be loaded with cv.")

    fps = video_cap.get(cv2.CAP_PROP_FPS)
    width = int(video_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(video_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(video_cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    if width <= 0 or height <= 0:
        _, frame = video_cap.retrieve()
        height, width, _ = frame.shape

    total_frame_count = 0
    total_frames_evaluated = -1
    frames_added = 0
    base_frame_time = 1 / fps
    prev_frame = None

    if force_rate == 0:
        target_frame_time = base_frame_time
    else:
        target_frame_time = 1 / force_rate

    # 计算可生成的帧数
    if total_frames > 0:
        if force_rate != 0:
            yieldable_frames = int(total_frames / fps * force_rate)
        else:
            yieldable_frames = total_frames
        if select_every_nth:
            yieldable_frames //= select_every_nth
        if frame_load_cap != 0:
            yieldable_frames = min(frame_load_cap, yieldable_frames)
    else:
        yieldable_frames = 0
    yield (
        width,
        height,
        fps,
        duration,
        total_frames,
        target_frame_time,
        yieldable_frames,
    )
    pbar = ProgressBar(yieldable_frames)
    time_offset = target_frame_time
    while video_cap.isOpened():
        if time_offset < target_frame_time:
            is_returned = video_cap.grab()
            if not is_returned:
                break
            time_offset += base_frame_time
        if time_offset < target_frame_time:
            continue
        time_offset -= target_frame_time
        total_frame_count += 1
        if total_frame_count <= skip_first_frames:
            continue
        else:
            total_frames_evaluated += 1

        if total_frames_evaluated % select_every_nth != 0:
            continue

        unused, frame = video_cap.retrieve()
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame = np.array(frame, dtype=np.float32)
        torch.from_numpy(frame).div_(255)
        if prev_frame is not None:
            inp = yield prev_frame
            if inp is not None:
                return
        prev_frame = frame
        frames_added += 1
        if pbar is not None:
            pbar.update_absolute(frames_added, yieldable_frames)
        if frame_load_cap > 0 and frames_added >= frame_load_cap:
            break
    if prev_frame is not None:
        yield prev_frame


def batched(it, n):
    """将迭代器分批"""
    while batch := tuple(itertools.islice(it, n)):
        yield batch


def resized_cv_frame_gen(custom_width, custom_height, downscale_ratio, **kwargs):
    """生成调整尺寸后的视频帧"""
    gen = cv_frame_generator(**kwargs)
    info = next(gen)
    width, height = info[0], info[1]
    frames_per_batch = (1920 * 1080 * 16) // (width * height) or 1
    if custom_width != 0 or custom_height != 0 or downscale_ratio is not None:
        new_size = target_size(
            width, height, custom_width, custom_height, downscale_ratio
        )
        yield (*info, new_size[0], new_size[1], False)
        if new_size[0] != width or new_size[1] != height:

            def rescale(frame):
                s = torch.from_numpy(
                    np.fromiter(frame, np.dtype((np.float32, (height, width, 3))))
                )
                s = s.movedim(-1, 1)
                s = common_upscale(s, new_size[0], new_size[1], "lanczos", "center")
                return s.movedim(1, -1).numpy()

            yield from itertools.chain.from_iterable(
                map(rescale, batched(gen, frames_per_batch))
            )
            return
    else:
        yield (*info, info[0], info[1], False)
    yield from gen


# ==================== 主加载视频函数 ====================
def load_video(
    unique_id=None, memory_limit_mb=None, generator=resized_cv_frame_gen, **kwargs
):
    """加载视频文件并返回帧、音频等信息"""
    if "force_size" in kwargs:
        kwargs.pop("force_size")
        logger.warn(
            "force_size has been removed. Did you reload the webpage after updating?"
        )
    kwargs["video"] = strip_path(kwargs["video"])
    downscale_ratio = 8
    gen = generator(downscale_ratio=downscale_ratio, **kwargs)
    (
        width,
        height,
        fps,
        duration,
        total_frames,
        target_frame_time,
        yieldable_frames,
        new_width,
        new_height,
        alpha,
    ) = next(gen)

    # 计算内存限制
    memory_limit = None
    if memory_limit_mb is not None:
        memory_limit *= 2**20
    else:
        try:
            memory_limit = (
                psutil.virtual_memory().available + psutil.swap_memory().free
            ) - 2**27
        except:
            logger.warn(
                "Failed to calculate available memory. Memory load limit has been disabled"
            )
            memory_limit = BIGMAX
    max_loadable_frames = int(memory_limit // (width * height * 3 * (0.1)))
    original_gen = gen
    gen = itertools.islice(gen, max_loadable_frames)
    images = torch.from_numpy(
        np.fromiter(
            gen, np.dtype((np.float32, (new_height, new_width, 4 if alpha else 3)))
        )
    )
    if memory_limit is not None:
        try:
            next(original_gen)
            raise RuntimeError(
                f"Memory limit hit after loading {len(images)} frames. Stopping execution."
            )
        except StopIteration:
            pass
    if len(images) == 0:
        raise RuntimeError("No frames generated")
    if "start_time" in kwargs:
        start_time = kwargs["start_time"]
    else:
        start_time = kwargs["skip_first_frames"] * target_frame_time
    target_frame_time *= kwargs.get("select_every_nth", 1)
    audio = lazy_get_audio(
        kwargs["video"], start_time, kwargs["frame_load_cap"] * target_frame_time
    )
    return (images, audio, len(images), None)


# ==================== 主节点类 ====================
class PMLoadVideo:
    """PM视频加载器节点 - 支持加载各种格式的视频文件"""

    @classmethod
    def INPUT_TYPES(s):
        """定义节点输入类型"""
        input_dir = folder_paths.get_input_directory()
        files = []
        for f in os.listdir(input_dir):
            if os.path.isfile(os.path.join(input_dir, f)):
                file_parts = f.split(".")
                if len(file_parts) > 1 and (file_parts[-1].lower() in video_extensions):
                    files.append(f)
        return {
            "required": {
                "video": (sorted(files),),
                "force_rate": (
                    floatOrInt,
                    {"default": 0, "min": 0, "max": 60, "step": 1, "disable": 0},
                ),
                "custom_width": (
                    "INT",
                    {"default": 0, "min": 0, "max": DIMMAX, "disable": 0},
                ),
                "custom_height": (
                    "INT",
                    {"default": 0, "min": 0, "max": DIMMAX, "disable": 0},
                ),
                "frame_load_cap": (
                    "INT",
                    {"default": 0, "min": 0, "max": BIGMAX, "step": 1, "disable": 0},
                ),
                "skip_first_frames": (
                    "INT",
                    {"default": 0, "min": 0, "max": BIGMAX, "step": 1},
                ),
                "select_every_nth": (
                    "INT",
                    {"default": 1, "min": 1, "max": BIGMAX, "step": 1},
                ),
            },
            "hidden": {"force_size": "STRING", "unique_id": "UNIQUE_ID"},
        }

    CATEGORY = "PM Manager"
    SEARCH_ALIASES = [
        "load video",
        "open video",
        "import video",
        "video input",
        "upload video",
        "read video",
        "video loader",
        "pm load video",
    ]

    RETURN_TYPES = ("IMAGE", "AUDIO", "INT", "VIDEO")
    RETURN_NAMES = ("IMAGE", "audio", "frame_count", "video")

    FUNCTION = "load_video"

    def load_video(self, **kwargs):
        """加载视频并返回帧、音频、帧数和视频对象"""
        video_path = folder_paths.get_annotated_filepath(strip_path(kwargs["video"]))
        kwargs["video"] = video_path
        images, audio, frame_count, _ = load_video(**kwargs)

        # 创建视频对象（如果ComfyUI API可用）
        video_obj = None
        if HAS_COMFY_API:
            try:
                video_obj = InputImpl.VideoFromFile(video_path)
            except Exception as e:
                logger.warn(f"Failed to create VideoFromFile object: {e}")

        return (images, audio, frame_count, video_obj)

    @classmethod
    def IS_CHANGED(s, video, **kwargs):
        """检查视频文件是否已更改"""
        image_path = folder_paths.get_annotated_filepath(video)
        return calculate_file_hash(image_path)

    @classmethod
    def VALIDATE_INPUTS(s, video):
        """验证输入文件是否有效"""
        if not folder_paths.exists_annotated_filepath(video):
            return "Invalid video file: {}".format(video)
        return True


# ==================== 节点映射 ====================
NODE_CLASS_MAPPINGS = {
    "PMLoadVideo": PMLoadVideo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PMLoadVideo": "PM Video Loader",
}
