import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

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
            audioWidget.value = audioPath;
            node.pm_selected_audio = audioPath;
            if (audioWidget.callback) {
              audioWidget.callback(audioPath);
            }
          }
        }
      }
    });
  } else {
    console.error("PM Input Manager not found");
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
        
        let uploadWidget = this.addWidget("button", "上传音频", "audio", () => {
          app.canvas.node_widget = null;
          fileInput.click();
        });
        uploadWidget.options.serialize = false;
        
        this.addWidget("button", "从输入选择文件", null, async () => {
          await openPMInputManagerForAudio(this, 'input');
        });
        this.addWidget("button", "从输出选择文件", null, async () => {
          await openPMInputManagerForAudio(this, 'output');
        });
        
        var element = document.createElement("audio");
        element.controls = true;
        const previewNode = this;
        var previewWidget = this.addDOMWidget("audiopreview", "preview", element, {
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
        
        previewWidget.value = { params: {} };
        previewWidget.updateSource = function () {
            if (!this.value.params || !this.value.params.filename) {
                return;
            }
            let params = {};
            Object.assign(params, this.value.params);
            params.timestamp = Date.now();
            element.src = api.apiURL('/view?' + new URLSearchParams(params));
        };
        
        const updateAudioSource = (filename) => {
            if (filename) {
                previewWidget.value.params = { filename: filename, type: "input" };
                previewWidget.updateSource();
            }
        };
        
        if (pathWidget) {
            const originalCallback = pathWidget.callback;
            pathWidget.callback = function(filename) {
                if (originalCallback) {
                    originalCallback.call(this, filename);
                }
                updateAudioSource(filename);
            };
            
            if (pathWidget.value) {
                updateAudioSource(pathWidget.value);
            }
        }
      };
      
      const originalOnConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function(info) {
        if (originalOnConfigure) {
          originalOnConfigure.apply(this, arguments);
        }
        
        if (info.widgets_values && info.widgets_values.length > 0) {
          const savedValue = info.widgets_values[0];
          if (savedValue) {
            this.pm_selected_audio = savedValue;
          }
        }
      };
    }
  }
});
