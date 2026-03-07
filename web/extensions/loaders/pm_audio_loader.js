import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { t, initPromise, onLocaleChange } from "../common/i18n.js";

let pmInputManagerCache = null;

function findPMInputManager() {
  if (pmInputManagerCache) {
    return pmInputManagerCache;
  }
  for (const ext of app.extensions) {
    if (ext.name === "ComfyUI.PMInput") {
      pmInputManagerCache = ext;
      return ext;
    }
  }
  return null;
}

async function uploadFile(file, progressCallback) {
  try {
    const body = new FormData();
    const new_file = new File([file], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
    body.append("image", new_file);
    
    const url = api.apiURL("/upload/image");
    const resp = await new Promise((resolve) => {
      let req = new XMLHttpRequest();
      req.upload.onprogress = (e) => progressCallback?.(e.loaded/e.total);
      req.onload = () => resolve(req);
      req.open('post', url, true);
      req.send(body);
    });

    if (resp.status !== 200) {
      alert(resp.status + " - " + resp.statusText);
    }
    return resp;
  } catch (error) {
    alert(error);
  }
}

export async function openPMInputManagerForAudio(node, directoryType = 'input') {
  const manager = findPMInputManager();
  if (manager && manager.dialog) {
    await manager.dialog.show({
      hideEmptyFolders: true,
      fixedFilter: 'audio',
      disableNewFolder: true,
      directoryType: directoryType,
      selectionCallback: (audioPath) => {
        if (node.widgets) {
          const audioWidget = node.widgets.find(w => w.name === 'audio');
          if (audioWidget) {
            // 从绝对路径中提取文件名
            const fileName = audioPath.split(/[/\\]/).pop();
            // 输入框只显示文件名
            audioWidget.value = fileName;
            // 内部保存完整的绝对路径
            node.pm_selected_audio = audioPath;
            node.pm_directory_type = directoryType;
            // 标记这是从PM管理器选择的文件
            node._pm_selecting_file = true;
            if (audioWidget.callback) {
              audioWidget.callback(audioPath);
            }
            node._pm_selecting_file = false;
          }
        }
      }
    });
  } else {
    console.error(t('pmInputManagerNotFound', 'PM Input Manager not found'));
  }
}

app.registerExtension({
  name: "ComfyUI.PMAudioLoader",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeType.comfyClass === "PMLoadAudio") {
      const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function() {
        if (originalOnNodeCreated) {
          originalOnNodeCreated.apply(this, arguments);
        }
        
        this.serialize_widgets = true;
        this.pm_selected_audio = null;
        
        const node = this;
        const pathWidget = this.widgets.find((w) => w.name === "audio");
        // 自定义序列化函数，返回完整路径而不是文件名
        pathWidget.serializeValue = () => {
          return node.pm_selected_audio || pathWidget.value;
        };
        const fileInput = document.createElement("input");
        
        const onNodeRemoved = this.onRemoved;
        this.onRemoved = () => {
          fileInput?.remove();
          if (onNodeRemoved) {
            onNodeRemoved.apply(this, arguments);
          }
        };
        
        const audioAccept = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/aac", "audio/mp4"];
        
        async function doUpload(file) {
          let resp = await uploadFile(file, (p) => node.progress = p);
          node.progress = undefined;
          if (resp.status != 200) {
            return false;
          }
          const filename = JSON.parse(resp.responseText).name;
          pathWidget.options.values.push(filename);
          pathWidget.value = filename;
          if (pathWidget.callback) {
            pathWidget.callback(filename);
          }
          return true;
        }
        
        Object.assign(fileInput, {
          type: "file",
          accept: audioAccept.join(','),
          style: "display: none",
          onchange: async () => {
            if (fileInput.files.length) {
              return await doUpload(fileInput.files[0]);
            }
          },
        });
        
        this.onDragOver = (e) => !!e?.dataTransfer?.types?.includes?.('Files');
        this.onDragDrop = async function(e) {
          if (!e?.dataTransfer?.types?.includes?.('Files')) {
            return false;
          }
          const item = e.dataTransfer?.files?.[0];
          if (audioAccept.includes(item?.type) || item?.name?.toLowerCase().match(/\.(mp3|wav|flac|aac|ogg|m4a)$/)) {
            return await doUpload(item);
          }
          return false;
        };
        
        document.body.append(fileInput);
        
        let uploadWidget = this.addWidget("button", "Upload Audio", "audio", () => {
          app.canvas.node_widget = null;
          fileInput.click();
        });
        uploadWidget.options.serialize = false;
        
        let selectInputWidget = this.addWidget("button", "Select from Input", null, async () => {
          await openPMInputManagerForAudio(this, 'input');
        });
        let selectOutputWidget = this.addWidget("button", "Select from Output", null, async () => {
          await openPMInputManagerForAudio(this, 'output');
        });

        // 等待翻译加载完成后更新按钮文本
        initPromise.then(() => {
          uploadWidget.label = t('uploadAudio', 'Upload Audio');
          selectInputWidget.label = t('selectFromInput', 'Select from Input');
          selectOutputWidget.label = t('selectFromOutput', 'Select from Output');
          if (app.canvas) {
            app.canvas.draw(true, true);
          }
        });

        // 监听语言变化
        onLocaleChange(() => {
          uploadWidget.label = t('uploadAudio', 'Upload Audio');
          selectInputWidget.label = t('selectFromInput', 'Select from Input');
          selectOutputWidget.label = t('selectFromOutput', 'Select from Output');
          if (app.canvas) {
            app.canvas.draw(true, true);
          }
        });
        
        var element = document.createElement("audio");
        element.controls = true;
        element.style.width = "100%";
        
        // 创建容器
        const container = document.createElement("div");
        container.style.width = "100%";
        container.style.height = "50px";
        container.appendChild(element);
        
        // 只阻止点击事件冒泡到节点
        const stopEvents = ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'touchstart', 'touchend'];
        stopEvents.forEach(eventType => {
            container.addEventListener(eventType, (e) => {
                e.stopPropagation();
            }, false);
            element.addEventListener(eventType, (e) => {
                e.stopPropagation();
            }, false);
        });
        
        const previewNode = this;
        var previewWidget = this.addDOMWidget("audiopreview", "preview", container, {
            serialize: false,
            hideOnZoom: true,
            getValue() {
                return element.value;
            },
            setValue(v) {
                element.value = v;
            },
        });
        previewWidget.computeSize = function(width) {
            return [width, 50];
        };
        
        previewWidget.value = { path: null };
        previewWidget.updateSource = function () {
            if (!this.value.path) {
                return;
            }
            // 使用绝对路径访问 /pm/view 端点
            const params = new URLSearchParams({
                path: this.value.path,
                timestamp: Date.now()
            });
            element.src = api.apiURL('/pm/view?' + params.toString());
        };

        // 辅助函数：判断路径是否为绝对路径
        const isAbsolutePath = (path) => {
            if (!path) return false;
            // Windows 绝对路径: C:\... 或 D:/...
            // Linux/Mac 绝对路径: /...
            return /^[a-zA-Z]:[\\\/]/.test(path) || path.startsWith('/');
        };

        // 辅助函数：异步获取基础目录
        const fetchBaseDir = async (type) => {
            const prefix = type === 'output' ? '/pm_output' : '/pm_input';
            try {
                const response = await fetch(`${prefix}/list`);
                const data = await response.json();
                if (data.base_dir) {
                    if (type === 'output') {
                        window.pm_output_base_dir = data.base_dir;
                    } else {
                        window.pm_input_base_dir = data.base_dir;
                    }
                    return data.base_dir;
                }
            } catch (e) {
                console.error('Failed to fetch base directory:', e);
            }
            return null;
        };

        // 辅助函数：将相对路径转换为绝对路径（支持异步）
        const toAbsolutePath = async (relativePath, type) => {
            if (!relativePath) return relativePath;
            if (isAbsolutePath(relativePath)) return relativePath;
            
            // 获取基础目录
            let basePath = type === 'output' 
                ? window.pm_output_base_dir 
                : window.pm_input_base_dir;
            
            if (!basePath) {
                // 如果基础目录未设置，主动从 API 获取
                basePath = await fetchBaseDir(type);
            }
            
            if (!basePath) {
                return relativePath;
            }
            
            // 组合成绝对路径
            return basePath + '/' + relativePath;
        };

        const updateAudioSource = async (filePath) => {
            // 优先使用 pm_selected_audio 中保存的完整绝对路径
            const actualPath = node.pm_selected_audio || filePath;
            if (actualPath) {
                // 如果是相对路径，转换为绝对路径
                const absolutePath = await toAbsolutePath(actualPath, node.pm_directory_type || "input");
                // 保存绝对路径
                previewWidget.value.path = absolutePath;
                previewWidget.updateSource();
            }
        };
        
        // 将 updateAudioSource 保存到节点实例，供 onConfigure 使用
        node.updateAudioSource = updateAudioSource;

        if (pathWidget) {
            const originalCallback = pathWidget.callback;
            pathWidget.callback = async function(filename) {
                if (originalCallback) {
                    originalCallback.call(this, filename);
                }
                // 只有当不是从PM管理器选择文件时，才重置 directory_type 为 input
                if (!node._pm_selecting_file) {
                    node.pm_directory_type = "input";
                    // 如果不是从PM管理器选择的，widget的值就是相对路径，也需要保存
                    node.pm_selected_audio = filename;
                }
                await updateAudioSource(filename);
            };

            if (pathWidget.value) {
                if (!node.pm_selected_audio) {
                    node.pm_selected_audio = pathWidget.value;
                }
                updateAudioSource(pathWidget.value);
            }
        }
        
        // 增加底部留白
        const originalComputeSize = this.computeSize;
        this.computeSize = function(out) {
            const size = originalComputeSize ? originalComputeSize.apply(this, arguments) : out || this.size;
            return [size[0], size[1] + 20];
        };
        this.setSize([this.size[0], this.computeSize([this.size[0], this.size[1]])[1]]);
      };
      
      const originalOnConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function(info) {
        if (originalOnConfigure) {
          originalOnConfigure.apply(this, arguments);
        }

        // 恢复 directory_type
        if (info.pm_directory_type) {
          this.pm_directory_type = info.pm_directory_type;
        }

        // 优先从 pm_selected_audio 恢复完整路径
        let savedValue = info.pm_selected_audio;
        if (!savedValue && info.widgets_values && info.widgets_values.length > 0) {
          savedValue = info.widgets_values[0];
        }
        
        if (savedValue) {
          // 保存完整的绝对路径
          this.pm_selected_audio = savedValue;
          // 输入框只显示文件名
          const pathWidget = this.widgets.find(w => w.name === 'audio');
          if (pathWidget) {
            const fileName = savedValue.split(/[/\\]/).pop();
            pathWidget.value = fileName;
          }
          // 更新预览音频
          if (this.updateAudioSource) {
            this.updateAudioSource(savedValue);
          }
        }
      };

      // 保存 directory_type 和完整路径到序列化数据
      const originalOnSerialize = nodeType.prototype.onSerialize;
      nodeType.prototype.onSerialize = function(info) {
        if (originalOnSerialize) {
          originalOnSerialize.apply(this, arguments);
        }
        if (this.pm_directory_type) {
          info.pm_directory_type = this.pm_directory_type;
        }
        // 保存完整的绝对路径
        if (this.pm_selected_audio) {
          info.pm_selected_audio = this.pm_selected_audio;
        }
      };
    }
  }
});
