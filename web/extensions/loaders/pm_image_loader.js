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

function fitHeight(node) {
  node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]]);
  node?.graph?.setDirtyCanvas(true);
}

// 获取不带标注的文件名（用于显示）
function getDisplayFilename(annotatedPath) {
  if (!annotatedPath) return '';
  if (annotatedPath.endsWith('[output]')) {
    return annotatedPath.slice(0, -8);
  } else if (annotatedPath.endsWith('[input]')) {
    return annotatedPath.slice(0, -7);
  }
  return annotatedPath;
}

// 获取标注类型
function getPathType(annotatedPath) {
  if (!annotatedPath) return 'input';
  if (annotatedPath.endsWith('[output]')) return 'output';
  if (annotatedPath.endsWith('[input]')) return 'input';
  return 'input';
}

export async function openPMInputManagerForImage(node, directoryType = 'input') {
  const manager = findPMInputManager();
  if (manager && manager.dialog) {
    await manager.dialog.show({
      hideEmptyFolders: true,
      fixedFilter: 'image',
      disableNewFolder: true,
      directoryType: directoryType,
      selectionCallback: (imagePath) => {
        if (node.widgets) {
          const imageWidget = node.widgets.find(w => w.name === 'image');
          if (imageWidget) {
            // 根据目录类型添加标注后缀（内部存储用）
            const annotatedPath = directoryType === 'output' 
              ? `${imagePath}[output]` 
              : `${imagePath}[input]`;
            
            // 保存完整路径（带标注）
            node.pm_selected_image = annotatedPath;
            node.pm_directory_type = directoryType;
            
            // 设置 widget 的值为不带标注的文件名（用于显示）
            imageWidget.value = imagePath;
            
            // 触发 onValueChanged 回调，更新预览
            if (imageWidget.callback) {
              imageWidget.callback(imagePath);
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
  name: "ComfyUI.PMImageLoader",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeType.comfyClass === "PMLoadImage") {
      const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function() {
        if (originalOnNodeCreated) {
          originalOnNodeCreated.apply(this, arguments);
        }
        
        this.serialize_widgets = true;
        this.pm_selected_image = null;
        this.pm_directory_type = 'input';
        
        const node = this;
        
        // 先添加按钮
        this.addWidget("button", "从输入选择文件", null, async () => {
          await openPMInputManagerForImage(this, 'input');
        });
        this.addWidget("button", "从输出选择文件", null, async () => {
          await openPMInputManagerForImage(this, 'output');
        });
        
        // 创建图片预览元素（在按钮之后添加，所以会显示在底部）
        var container = document.createElement("div");
        container.style.marginTop = "10px";
        
        var element = document.createElement("img");
        element.style.width = "100%";
        element.style.height = "auto";
        element.style.display = "block";
        // 不设置 borderRadius，保持直角
        container.appendChild(element);
        
        // 创建尺寸显示元素
        var sizeInfo = document.createElement("div");
        sizeInfo.style.textAlign = "center";
        sizeInfo.style.fontSize = "12px";
        sizeInfo.style.color = "var(--fg)";
        sizeInfo.style.marginTop = "5px";
        sizeInfo.style.padding = "2px 0";
        container.appendChild(sizeInfo);
        
        const previewNode = this;
        var previewWidget = this.addDOMWidget("imagepreview", "preview", container, {
          serialize: false,
          hideOnZoom: true,
          getValue() {
            return element.src;
          },
          setValue(v) {
            element.src = v;
          },
        });
        
        previewWidget.computeSize = function(width) {
          if (this.aspectRatio && !container.hidden) {
            let height = (previewNode.size[0] - 20) / this.aspectRatio + 10;
            if (!(height > 0)) {
              height = 0;
            }
            // 加上尺寸信息的高度
            this.computedHeight = height + 25;
            return [width, this.computedHeight];
          }
          return [width, -4];
        };
        
        element.addEventListener("load", () => {
          previewWidget.aspectRatio = element.naturalWidth / element.naturalHeight;
          // 更新尺寸信息
          sizeInfo.textContent = `${element.naturalWidth} x ${element.naturalHeight}`;
          fitHeight(previewNode);
        });
        
        element.addEventListener("error", () => {
          container.hidden = true;
          sizeInfo.textContent = '';
          fitHeight(previewNode);
        });
        
        previewWidget.updateSource = function() {
          const imageWidget = node.widgets.find(w => w.name === 'image');
          if (!imageWidget || !imageWidget.value) {
            container.hidden = true;
            sizeInfo.textContent = '';
            return;
          }
          
          // 使用 widget 的显示值（不带标注）
          const filename = imageWidget.value;
          const type = node.pm_directory_type || "input";
          
          // 使用 ComfyUI 的 view API 加载图片
          const params = new URLSearchParams({
            filename: filename,
            type: type,
            rand: Math.random()
          });
          
          element.src = api.apiURL('/view?' + params.toString());
          container.hidden = false;
          fitHeight(previewNode);
        };
        
        // 监听 widget 值变化，更新预览
        const imageWidget = this.widgets.find(w => w.name === 'image');
        if (imageWidget) {
          const originalCallback = imageWidget.callback;
          imageWidget.callback = function(value) {
            if (originalCallback) {
              originalCallback.apply(this, arguments);
            }
            // 更新内部保存的完整路径
            const type = node.pm_directory_type || 'input';
            node.pm_selected_image = value + `[${type}]`;
            
            // 更新预览
            setTimeout(() => {
              if (previewWidget && previewWidget.updateSource) {
                previewWidget.updateSource();
              }
            }, 100);
          };
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
            this.pm_selected_image = savedValue;
            // 根据保存的值确定目录类型
            const dirType = getPathType(savedValue);
            this.pm_directory_type = dirType;
            
            // 恢复 widget 的显示值（不带标注）
            const imageWidget = this.widgets.find(w => w.name === 'image');
            if (imageWidget) {
              imageWidget.value = getDisplayFilename(savedValue);
            }
            
            // 恢复后更新预览
            setTimeout(() => {
              const previewWidget = this.widgets?.find(w => w.name === "imagepreview");
              if (previewWidget && previewWidget.updateSource) {
                previewWidget.updateSource();
              }
            }, 100);
          }
        }
      };
      
      // 在序列化时保存带标注的完整路径
      const originalOnSerialize = nodeType.prototype.onSerialize;
      nodeType.prototype.onSerialize = function(o) {
        if (originalOnSerialize) {
          originalOnSerialize.apply(this, arguments);
        }
        // 保存带标注的路径供后端使用
        if (this.pm_selected_image) {
          o.pm_selected_image = this.pm_selected_image;
        }
      };
    }
  }
});
