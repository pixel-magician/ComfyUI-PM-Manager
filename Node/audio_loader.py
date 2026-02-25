import folder_paths
import os
import hashlib
import torch
import subprocess
import re


class PMLoadAudio:
    @classmethod
    def INPUT_TYPES(s):
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
        audio_path = folder_paths.get_annotated_filepath(audio)

        args = ["ffmpeg", "-i", audio_path]
        try:
            res = subprocess.run(
                args + ["-f", "f32le", "-"], capture_output=True, check=True
            )
            audio_data = torch.frombuffer(bytearray(res.stdout), dtype=torch.float32)
            match = re.search(
                ", (\\d+) Hz, (\\w+), ", res.stderr.decode("utf-8", errors="ignore")
            )
        except subprocess.CalledProcessError as e:
            raise Exception(
                f"Failed to extract audio from {audio_path}:\n"
                + e.stderr.decode("utf-8", errors="ignore")
            )

        if match:
            ar = int(match.group(1))
            ac = {"mono": 1, "stereo": 2}.get(match.group(2), 2)
        else:
            ar = 44100
            ac = 2

        audio_data = audio_data.reshape((-1, ac)).transpose(0, 1).unsqueeze(0)

        return ({"waveform": audio_data, "sample_rate": ar},)

    @classmethod
    def IS_CHANGED(s, audio):
        audio_path = folder_paths.get_annotated_filepath(audio)
        m = hashlib.sha256()
        with open(audio_path, "rb") as f:
            m.update(f.read())
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(s, audio):
        if not folder_paths.exists_annotated_filepath(audio):
            return "Invalid audio file: {}".format(audio)

        return True


NODE_CLASS_MAPPINGS = {
    "PMLoadAudio": PMLoadAudio,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PMLoadAudio": "PM Audio Loader",
}
