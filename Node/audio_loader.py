import folder_paths
import os
import hashlib
import torch
import subprocess
import re


class PMLoadAudio:
    """PM音频加载器节点 - 支持加载各种格式的音频文件"""

    @classmethod
    def INPUT_TYPES(s):
        """定义节点输入类型"""
        input_dir = folder_paths.get_input_directory()
        files = [
            f
            for f in os.listdir(input_dir)
            if os.path.isfile(os.path.join(input_dir, f))
        ]
        files = folder_paths.filter_files_content_types(files, ["audio"])
        return {
            "required": {"audio": (sorted(files),)},
        }

    CATEGORY = "PM Manager"
    SEARCH_ALIASES = [
        "load audio",
        "open audio",
        "import audio",
        "audio input",
        "upload audio",
        "read audio",
        "audio loader",
        "pm load audio",
    ]

    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "load_audio"

    def load_audio(self, audio):
        """加载音频文件并返回音频数据"""
        audio_path = folder_paths.get_annotated_filepath(audio)

        # 使用FFmpeg提取音频数据
        args = ["ffmpeg", "-i", audio_path]
        try:
            res = subprocess.run(
                args + ["-f", "f32le", "-"], capture_output=True, check=True
            )
            audio_data = torch.frombuffer(bytearray(res.stdout), dtype=torch.float32)
            # 从FFmpeg输出中解析采样率和声道信息
            match = re.search(
                ", (\\d+) Hz, (\\w+), ", res.stderr.decode("utf-8", errors="ignore")
            )
        except subprocess.CalledProcessError as e:
            raise Exception(
                f"无法从 {audio_path} 提取音频:\n"
                + e.stderr.decode("utf-8", errors="ignore")
            )

        # 解析音频参数
        if match:
            ar = int(match.group(1))  # 采样率
            ac = {"mono": 1, "stereo": 2}.get(match.group(2), 2)  # 声道数
        else:
            ar = 44100  # 默认采样率
            ac = 2  # 默认立体声

        # 重塑音频数据为 [batch, channels, samples] 格式
        audio_data = audio_data.reshape((-1, ac)).transpose(0, 1).unsqueeze(0)

        return ({"waveform": audio_data, "sample_rate": ar},)

    @classmethod
    def IS_CHANGED(s, audio):
        """检查音频文件是否已更改"""
        audio_path = folder_paths.get_annotated_filepath(audio)
        m = hashlib.sha256()
        with open(audio_path, "rb") as f:
            m.update(f.read())
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(s, audio):
        """验证输入文件是否有效"""
        if not folder_paths.exists_annotated_filepath(audio):
            return "无效的音频文件: {}".format(audio)

        return True


# 节点类映射
NODE_CLASS_MAPPINGS = {
    "PMLoadAudio": PMLoadAudio,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "PMLoadAudio": "PM Audio Loader",
}
