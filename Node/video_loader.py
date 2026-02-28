import os
import itertools
import numpy as np
import torch
import cv2
import psutil
import subprocess
import re
import hashlib
import shutil
import logging
import sys
import copy
from collections.abc import Mapping

import folder_paths
from comfy.utils import common_upscale, ProgressBar
from comfy_api.latest import IO

try:
    from comfy_api.latest import InputImpl
    HAS_COMFY_API = True
except ImportError:
    HAS_COMFY_API = False

# ==================== Logger ====================
class ColoredFormatter(logging.Formatter):
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

# ==================== Constants ====================
BIGMIN = -(2**53-1)
BIGMAX = (2**53-1)
DIMMAX = 8192
ENCODE_ARGS = ("utf-8", 'backslashreplace')
video_extensions = ['webm', 'mp4', 'mkv', 'gif', 'mov']

# ==================== Utility Classes ====================
class MultiInput(str):
    def __new__(cls, string, allowed_types="*"):
        res = super().__new__(cls, string)
        res.allowed_types=allowed_types
        return res
    def __ne__(self, other):
        if self.allowed_types == "*" or other == "*":
            return False
        return other not in self.allowed_types

floatOrInt = MultiInput("FLOAT", ["FLOAT", "INT"])

class ContainsAll(dict):
    def __contains__(self, other):
        return True
    def __getitem__(self, key):
        return super().get(key, (None, {}))

class LazyAudioMap(Mapping):
    def __init__(self, file, start_time, duration):
        self.file = file
        self.start_time=start_time
        self.duration=duration
        self._dict=None
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

# ==================== FFmpeg Path Handling ====================
def ffmpeg_suitability(path):
    try:
        version = subprocess.run([path, "-version"], check=True,
                                 capture_output=True).stdout.decode(*ENCODE_ARGS)
    except:
        return 0
    score = 0
    simple_criterion = [("libvpx", 20),("264",10), ("265",3),
                        ("svtav1",5),("libopus", 1)]
    for criterion in simple_criterion:
        if version.find(criterion[0]) >= 0:
            score += criterion[1]
    copyright_index = version.find('2000-2')
    if copyright_index >= 0:
        copyright_year = version[copyright_index+6:copyright_index+9]
        if copyright_year.isnumeric():
            score += int(copyright_year)
    return score

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

# ==================== File/Path Utilities ====================
def strip_path(path):
    path = path.strip()
    if path.startswith("\""):
        path = path[1:]
    if path.endswith("\""):
        path = path[:-1]
    return path

def calculate_file_hash(filename: str, hash_every_n: int = 1):
    h = hashlib.sha256()
    h.update(filename.encode())
    h.update(str(os.path.getmtime(filename)).encode())
    return h.hexdigest()

def hash_path(path):
    if path is None:
        return "input"
    if is_url(path):
        return "url"
    if not os.path.isfile(path):
        return "DNE"
    return calculate_file_hash(strip_path(path))

def is_url(url):
    return url.split("://")[0] in ["http", "https"]

def is_safe_path(path, strict=False):
    if "VHS_STRICT_PATHS" not in os.environ and not strict:
        return True
    basedir = os.path.abspath('.')
    try:
        common_path = os.path.commonpath([basedir, path])
    except:
        return False
    return common_path == basedir

def validate_path(path, allow_none=False, allow_url=True):
    if path is None:
        return allow_none
    if is_url(path):
        if not allow_url:
            return "URLs are unsupported for this path"
        return is_safe_path(path)
    if not os.path.isfile(strip_path(path)):
        return "Invalid file path: {}".format(path)
    return is_safe_path(path)

# ==================== Audio Utilities ====================
def get_audio(file, start_time=0, duration=0):
    args = [ffmpeg_path, "-i", file]
    if start_time > 0:
        args += ["-ss", str(start_time)]
    if duration > 0:
        args += ["-t", str(duration)]
    try:
        res =  subprocess.run(args + ["-f", "f32le", "-"],
                              capture_output=True, check=True)
        audio = torch.frombuffer(bytearray(res.stdout), dtype=torch.float32)
        match = re.search(', (\\d+) Hz, (\\w+), ',res.stderr.decode(*ENCODE_ARGS))
    except subprocess.CalledProcessError as e:
        raise Exception(f"Failed to extract audio from {file}:\n" \
                + e.stderr.decode(*ENCODE_ARGS))
    if match:
        ar = int(match.group(1))
        ac = {"mono": 1, "stereo": 2}[match.group(2)]
    else:
        ar = 44100
        ac = 2
    audio = audio.reshape((-1,ac)).transpose(0,1).unsqueeze(0)
    return {'waveform': audio, 'sample_rate': ar}

def lazy_get_audio(file, start_time=0, duration=0, **kwargs):
    return LazyAudioMap(file, start_time, duration)

# ==================== Frame Generators ====================
def cv_frame_generator(video, force_rate, frame_load_cap, skip_first_frames,
                       select_every_nth):
    video_cap = cv2.VideoCapture(video)
    if not video_cap.isOpened() or not video_cap.grab():
        raise ValueError(f"{video} could not be loaded with cv.")

    fps = video_cap.get(cv2.CAP_PROP_FPS)
    width = int(video_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(video_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(video_cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    if width <=0 or height <=0:
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
        target_frame_time = 1/force_rate

    if total_frames > 0:
        if force_rate != 0:
            yieldable_frames = int(total_frames / fps * force_rate)
        else:
            yieldable_frames = total_frames
        if select_every_nth:
            yieldable_frames //= select_every_nth
        if frame_load_cap != 0:
            yieldable_frames =  min(frame_load_cap, yieldable_frames)
    else:
        yieldable_frames = 0
    yield (width, height, fps, duration, total_frames, target_frame_time, yieldable_frames)
    pbar = ProgressBar(yieldable_frames)
    time_offset=target_frame_time
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

        if total_frames_evaluated%select_every_nth != 0:
            continue

        unused, frame = video_cap.retrieve()
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame = np.array(frame, dtype=np.float32)
        torch.from_numpy(frame).div_(255)
        if prev_frame is not None:
            inp  = yield prev_frame
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
    while batch := tuple(itertools.islice(it, n)):
        yield batch

def target_size(width, height, custom_width, custom_height, downscale_ratio=8) -> tuple[int, int]:
    if downscale_ratio is None:
        downscale_ratio = 8
    if custom_width == 0 and custom_height ==  0:
        pass
    elif custom_height == 0:
        height *= custom_width/width
        width = custom_width
    elif custom_width == 0:
        width *= custom_height/height
        height = custom_height
    else:
        width = custom_width
        height = custom_height
    width = int(width/downscale_ratio + 0.5) * downscale_ratio
    height = int(height/downscale_ratio + 0.5) * downscale_ratio
    return (width, height)

def resized_cv_frame_gen(custom_width, custom_height, downscale_ratio, **kwargs):
    gen = cv_frame_generator(**kwargs)
    info =  next(gen)
    width, height = info[0], info[1]
    frames_per_batch = (1920 * 1080 * 16) // (width * height) or 1
    if custom_width != 0 or custom_height != 0 or downscale_ratio is not None:
        new_size = target_size(width, height, custom_width, custom_height, downscale_ratio)
        yield (*info, new_size[0], new_size[1], False)
        if new_size[0] != width or new_size[1] != height:
            def rescale(frame):
                s = torch.from_numpy(np.fromiter(frame, np.dtype((np.float32, (height, width, 3)))))
                s = s.movedim(-1,1)
                s = common_upscale(s, new_size[0], new_size[1], "lanczos", "center")
                return s.movedim(1,-1).numpy()
            yield from itertools.chain.from_iterable(map(rescale, batched(gen, frames_per_batch)))
            return
    else:
        yield (*info, info[0], info[1], False)
    yield from gen

# ==================== Main Load Video Function ====================
def load_video(unique_id=None, memory_limit_mb=None,
               generator=resized_cv_frame_gen, **kwargs):
    if 'force_size' in kwargs:
        kwargs.pop('force_size')
        logger.warn("force_size has been removed. Did you reload the webpage after updating?")
    kwargs['video'] = strip_path(kwargs['video'])
    downscale_ratio = 8
    gen = generator(downscale_ratio=downscale_ratio, **kwargs)
    (width, height, fps, duration, total_frames, target_frame_time, yieldable_frames, new_width, new_height, alpha) = next(gen)

    memory_limit = None
    if memory_limit_mb is not None:
        memory_limit *= 2 ** 20
    else:
        try:
            memory_limit = (psutil.virtual_memory().available + psutil.swap_memory().free) - 2 ** 27
        except:
            logger.warn("Failed to calculate available memory. Memory load limit has been disabled")
            memory_limit = BIGMAX
    max_loadable_frames = int(memory_limit//(width*height*3*(.1)))
    original_gen = gen
    gen = itertools.islice(gen, max_loadable_frames)
    images = torch.from_numpy(np.fromiter(gen, np.dtype((np.float32, (new_height, new_width, 4 if alpha else 3)))))
    if memory_limit is not None:
        try:
            next(original_gen)
            raise RuntimeError(f"Memory limit hit after loading {len(images)} frames. Stopping execution.")
        except StopIteration:
            pass
    if len(images) == 0:
        raise RuntimeError("No frames generated")
    if 'start_time' in kwargs:
        start_time = kwargs['start_time']
    else:
        start_time = kwargs['skip_first_frames'] * target_frame_time
    target_frame_time *= kwargs.get('select_every_nth', 1)
    audio = lazy_get_audio(kwargs['video'], start_time, kwargs['frame_load_cap']*target_frame_time)
    return (images, audio, len(images), None)

# ==================== Main Node Class ====================
class PMLoadVideo(IO.ComfyNode):
    @classmethod
    def define_schema(cls) -> IO.Schema:
        input_dir = folder_paths.get_input_directory()
        files = []
        for f in os.listdir(input_dir):
            if os.path.isfile(os.path.join(input_dir, f)):
                file_parts = f.split('.')
                if len(file_parts) > 1 and (file_parts[-1].lower() in video_extensions):
                    files.append(f)

        return IO.Schema(
            node_id="PMLoadVideo",
            display_name="PM Video Loader",
            category="PM Manager",
            search_aliases=[
                "load video",
                "open video",
                "import video",
                "video input",
                "upload video",
                "read video",
                "video loader",
                "pm load video",
            ],
            inputs=[
                IO.Combo.Input("video", options=sorted(files)),
                IO.Float.Input("force_rate", default=0, min=0, max=60, step=1, extra_dict={"reset": 0}),
                IO.Int.Input("custom_width", default=0, min=0, max=DIMMAX, extra_dict={"reset": 0}),
                IO.Int.Input("custom_height", default=0, min=0, max=DIMMAX, extra_dict={"reset": 0}),
                IO.Int.Input("frame_load_cap", default=0, min=0, max=BIGMAX, step=1, extra_dict={"reset": 0}),
                IO.Int.Input("skip_first_frames", default=0, min=0, max=BIGMAX, step=1, extra_dict={"reset": 0}),
                IO.Int.Input("select_every_nth", default=1, min=1, max=BIGMAX, step=1, extra_dict={"reset": 1}),
            ],
            outputs=[
                IO.Image.Output("images"),
                IO.Audio.Output("audio"),
                IO.Int.Output("frame_count"),
                IO.Video.Output("video"),
            ],
        )

    @classmethod
    def execute(cls, video, force_rate, custom_width, custom_height, frame_load_cap,
                skip_first_frames, select_every_nth, **kwargs) -> IO.NodeOutput:
        video_path = folder_paths.get_annotated_filepath(strip_path(video))

        kwargs_exec = {
            'video': video_path,
            'force_rate': force_rate,
            'custom_width': custom_width,
            'custom_height': custom_height,
            'frame_load_cap': frame_load_cap,
            'skip_first_frames': skip_first_frames,
            'select_every_nth': select_every_nth,
            'unique_id': kwargs.get('unique_id'),
        }

        images, audio, frame_count, _ = load_video(**kwargs_exec)

        video_obj = None
        if HAS_COMFY_API:
            try:
                video_obj = InputImpl.VideoFromFile(video_path)
            except Exception as e:
                logger.warn(f"Failed to create VideoFromFile object: {e}")

        return IO.NodeOutput(images, audio, frame_count, video_obj)

    @classmethod
    def fingerprint_inputs(cls, video, **kwargs):
        image_path = folder_paths.get_annotated_filepath(video)
        return calculate_file_hash(image_path)

    @classmethod
    def validate_inputs(cls, video, **kwargs):
        if not folder_paths.exists_annotated_filepath(video):
            return "Invalid video file: {}".format(video)
        return True
