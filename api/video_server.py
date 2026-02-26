import os
import re
import asyncio
import subprocess
import server
import folder_paths
import shutil

ENCODE_ARGS = ("utf-8", "backslashreplace")

query_cache = {}

ffmpeg_path = None
try:
    from imageio_ffmpeg import get_ffmpeg_exe
    ffmpeg_path = get_ffmpeg_exe()
except:
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg is not None:
        ffmpeg_path = system_ffmpeg
    elif os.path.isfile("ffmpeg.exe"):
        ffmpeg_path = os.path.abspath("ffmpeg.exe")


def is_safe_path(path, strict=False):
    basedir = os.path.abspath('.')
    try:
        common_path = os.path.commonpath([basedir, path])
    except:
        return False
    return common_path == basedir


async def resolve_path(query):
    if "filename" not in query:
        return server.web.Response(status=204)
    filename = query["filename"]

    filename, output_dir = folder_paths.annotated_filepath(filename)

    type = query.get("type", "output")
    if output_dir is None:
        output_dir = folder_paths.get_directory_by_type(type)

    if output_dir is None:
        return server.web.Response(status=204)

    if not is_safe_path(output_dir):
        return server.web.Response(status=204)

    if "subfolder" in query:
        output_dir = os.path.join(output_dir, query["subfolder"])

    filename = os.path.basename(filename)
    file = os.path.join(output_dir, filename)

    if not os.path.exists(file):
        return server.web.Response(status=204)
    if not os.path.isfile(file):
        return server.web.Response(status=204)
    return file, filename, output_dir


@server.PromptServer.instance.routes.get("/pm/viewvideo")
async def pm_view_video(request):
    query = request.rel_url.query
    path_res = await resolve_path(query)
    if isinstance(path_res, server.web.Response):
        return path_res
    file, filename, output_dir = path_res

    if ffmpeg_path is None:
        if is_safe_path(output_dir, strict=True):
            return server.web.FileResponse(path=file)

    in_args = ["-i", file]

    base_fps = 30
    try:
        proc = await asyncio.create_subprocess_exec(ffmpeg_path, *in_args, '-t',
                                   '0', '-f', 'null', '-', stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
        _, res_stderr = await proc.communicate()

        match = re.search(': Video: (\\w+) .+, (\\d+) fps,', res_stderr.decode(*ENCODE_ARGS))
        if match:
            base_fps = float(match.group(2))
            if match.group(1) == 'vp9':
                in_args = ['-c:v', 'libvpx-vp9'] + in_args
    except subprocess.CalledProcessError:
        pass

    vfilters = []
    target_rate = float(query.get('force_rate', 0)) or base_fps
    modified_rate = target_rate / (float(query.get('select_every_nth', 1)) or 1)
    start_time = 0
    if 'start_time' in query:
        start_time = float(query['start_time'])
    elif float(query.get('skip_first_frames', 0)) > 0:
        start_time = float(query.get('skip_first_frames')) / target_rate
        if start_time > 1/modified_rate:
            start_time += 1/modified_rate
    if start_time > 0:
        if start_time > 4:
            post_seek = ['-ss', '4']
            pre_seek = ['-ss', str(start_time - 4)]
        else:
            post_seek = ['-ss', str(start_time)]
            pre_seek = []
    else:
        pre_seek = []
        post_seek = []

    args = [ffmpeg_path, "-v", "error"] + pre_seek + in_args + post_seek
    if target_rate != 0:
        args += ['-r', str(modified_rate)]
    if query.get('force_size', 'Disabled') != "Disabled":
        size = query['force_size'].split('x')
        if size[0] == '?' or size[1] == '?':
            size[0] = "-2" if size[0] == '?' else f"'min({size[0]},iw)'"
            size[1] = "-2" if size[1] == '?' else f"'min({size[1]},ih)'"
        else:
            ar = float(size[0])/float(size[1])
            vfilters.append(f"crop=if(gt({ar}\\,a)\\,iw\\,ih*{ar}):if(gt({ar}\\,a)\\,iw/{ar}\\,ih)")
        size = ':'.join(size)
        vfilters.append(f"scale={size}")
    if len(vfilters) > 0:
        args += ["-vf", ",".join(vfilters)]
    if float(query.get('frame_load_cap', 0)) > 0:
        args += ["-frames:v", query['frame_load_cap'].split('.')[0]]

    args += ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-f', 'webm', '-']

    try:
        proc = await asyncio.create_subprocess_exec(*args, stdout=subprocess.PIPE,
                                                    stdin=subprocess.DEVNULL)
        try:
            resp = server.web.StreamResponse()
            resp.content_type = 'video/webm'
            resp.headers["Content-Disposition"] = f'filename="{filename}"'
            await resp.prepare(request)
            while len(bytes_read := await proc.stdout.read(2**20)) != 0:
                await resp.write(bytes_read)
            await proc.wait()
        except (ConnectionResetError, ConnectionError):
            proc.kill()
    except BrokenPipeError:
        pass
    return resp


@server.PromptServer.instance.routes.get("/pm/queryvideo")
async def pm_query_video(request):
    query = request.rel_url.query
    path_res = await resolve_path(query)
    if isinstance(path_res, server.web.Response):
        return path_res
    filepath = path_res[0]

    if filepath.endswith(".webp"):
        return server.web.json_response({})

    if filepath in query_cache and query_cache[filepath][0] == os.stat(filepath).st_mtime:
        source = query_cache[filepath][1]
    else:
        source = {}
        try:
            import av
            with av.open(filepath) as cont:
                stream = cont.streams.video[0]
                source['fps'] = float(stream.average_rate)
                source['duration'] = float(cont.duration / av.time_base)

                if stream.codec_context.name == 'vp9':
                    cc = av.Codec('libvpx-vp9', 'r').create()
                else:
                    cc = stream

                def fit():
                    for packet in cont.demux(video=0):
                        yield from cc.decode(packet)
                frame = next(fit())

                source['size'] = [frame.width, frame.height]
                source['alpha'] = 'a' in frame.format.name
                source['frames'] = stream.metadata.get('NUMBER_OF_FRAMES', round(source['duration'] * source['fps']))
                query_cache[filepath] = (os.stat(filepath).st_mtime, source)
        except Exception:
            pass

    if not 'frames' in source:
        return server.web.json_response({})

    loaded = {}
    loaded['duration'] = source['duration']
    loaded['duration'] -= float(query.get('start_time', 0))
    loaded['fps'] = float(query.get('force_rate', 0)) or source.get('fps', 1)
    loaded['duration'] -= int(query.get('skip_first_frames', 0)) / loaded['fps']
    loaded['fps'] /= int(query.get('select_every_nth', 1)) or 1
    loaded['frames'] = round(loaded['duration'] * loaded['fps'])
    return server.web.json_response({'source': source, 'loaded': loaded})
