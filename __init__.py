import logging

logger = logging.getLogger(__name__)



# # 导入所有节点类
# from .Node.unet_loader import (
#     NODE_CLASS_MAPPINGS as UNET_NODE_CLASS_MAPPINGS,
#     NODE_DISPLAY_NAME_MAPPINGS as UNET_NODE_DISPLAY_NAME_MAPPINGS,
# )
# from .Node.lora_loader import (
#     NODE_CLASS_MAPPINGS as LORA_NODE_CLASS_MAPPINGS,
#     NODE_DISPLAY_NAME_MAPPINGS as LORA_NODE_DISPLAY_NAME_MAPPINGS,
# )
# from .Node.vae_loader import (
#     NODE_CLASS_MAPPINGS as VAE_NODE_CLASS_MAPPINGS,
#     NODE_DISPLAY_NAME_MAPPINGS as VAE_NODE_DISPLAY_NAME_MAPPINGS,
# )
# from .Node.clip_loader import (
#     NODE_CLASS_MAPPINGS as CLIP_NODE_CLASS_MAPPINGS,
#     NODE_DISPLAY_NAME_MAPPINGS as CLIP_NODE_DISPLAY_NAME_MAPPINGS,
# )
# from .Node.image_loader import (
#     NODE_CLASS_MAPPINGS as IMAGE_NODE_CLASS_MAPPINGS,
#     NODE_DISPLAY_NAME_MAPPINGS as IMAGE_NODE_DISPLAY_NAME_MAPPINGS,
# )
# from .Node.audio_loader import (
#     NODE_CLASS_MAPPINGS as AUDIO_NODE_CLASS_MAPPINGS,
#     NODE_DISPLAY_NAME_MAPPINGS as AUDIO_NODE_DISPLAY_NAME_MAPPINGS,
# )
# from .Node.video_loader import (
#     NODE_CLASS_MAPPINGS as VIDEO_NODE_CLASS_MAPPINGS,
#     NODE_DISPLAY_NAME_MAPPINGS as VIDEO_NODE_DISPLAY_NAME_MAPPINGS,
# )

# # 合并所有节点映射
# NODE_CLASS_MAPPINGS = {
#     **UNET_NODE_CLASS_MAPPINGS,
#     **LORA_NODE_CLASS_MAPPINGS,
#     **VAE_NODE_CLASS_MAPPINGS,
#     **CLIP_NODE_CLASS_MAPPINGS,
#     **IMAGE_NODE_CLASS_MAPPINGS,
#     **AUDIO_NODE_CLASS_MAPPINGS,
#     **VIDEO_NODE_CLASS_MAPPINGS,
# }
# NODE_DISPLAY_NAME_MAPPINGS = {
#     **UNET_NODE_DISPLAY_NAME_MAPPINGS,
#     **LORA_NODE_DISPLAY_NAME_MAPPINGS,
#     **VAE_NODE_DISPLAY_NAME_MAPPINGS,
#     **CLIP_NODE_DISPLAY_NAME_MAPPINGS,
#     **IMAGE_NODE_DISPLAY_NAME_MAPPINGS,
#     **AUDIO_NODE_DISPLAY_NAME_MAPPINGS,
#     **VIDEO_NODE_DISPLAY_NAME_MAPPINGS,
# }

WEB_DIRECTORY = "./web"
# __all__ = ["WEB_DIRECTORY"]


# 导入视频服务器端点（自动注册路由）
from .api import video_server  # noqa: F401

def setup_routes():
    from server import PromptServer
    from .api import (
        # Workflows
        list_pm_workflows,
        get_pm_workflow_preview,
        load_pm_workflow,
        save_pm_workflow,
        delete_pm_workflow,
        rename_pm_workflow,
        replace_preview,
        new_folder,
        new_workflow,
        # Models
        list_pm_models,
        get_pm_model_preview,
        get_model_info,
        get_model_metadata,
        save_model_metadata,
        replace_model_preview,
        delete_pm_model,
        rename_pm_model,
        new_model_folder,
        # Media (Input/Output)
        list_pm_input,
        get_pm_input_preview,
        get_pm_input_info,
        delete_pm_input,
        rename_pm_input,
        new_input_folder,
        upload_pm_input,
        list_pm_output,
        get_pm_output_preview,
        get_pm_output_info,
        delete_pm_output,
        rename_pm_output,
        new_output_folder,
        get_pm_output_metadata,
        upload_pm_output,
    )

    # Workflow routes
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

    # Model routes
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

    # Input routes
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

    @PromptServer.instance.routes.post("/pm_input/upload")
    async def upload_input_route(request):
        return await upload_pm_input(request)

    # Output routes
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

    @PromptServer.instance.routes.post("/pm_output/upload")
    async def upload_output_route(request):
        return await upload_pm_output(request)


# 初始化路由
setup_routes()

from comfy_api.latest import ComfyExtension, IO
from .Node.unet_loader import PMUNetLoader
from .Node.lora_loader import PMLoraLoader
from .Node.vae_loader import PMVAELoader
from .Node.clip_loader import PMClipLoader
from .Node.image_loader import PMLoadImage
from .Node.audio_loader import PMLoadAudio
from .Node.video_loader import PMLoadVideo


class PMManagerExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[IO.ComfyNode]]:
        return [
            PMUNetLoader,
            PMLoraLoader,
            PMVAELoader,
            PMClipLoader,
            PMLoadImage,
            PMLoadAudio,
            PMLoadVideo,
        ]


async def comfy_entrypoint() -> PMManagerExtension:
    return PMManagerExtension()

