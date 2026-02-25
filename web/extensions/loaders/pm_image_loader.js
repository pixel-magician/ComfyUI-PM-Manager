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
        
        // 创建图片预览 Widget (参照 rgthree 的 Canvas 实现)
        class PMPreviewWidget {
          constructor(node) {
            this.name = "imagepreview";
            this.type = "custom";
            this.node = node;
            this.image = new Image();
            this.imageLoaded = false;
            this.options = { serialize: false };
            
            this.image.onload = () => {
              this.imageLoaded = true;
              node.setDirtyCanvas(true, true);
            };
            
            this.image.onerror = () => {
              this.imageLoaded = false;
              node.setDirtyCanvas(true, true);
            };
          }

          draw(ctx, node, widgetWidth, y, widgetHeight) {
            if (!this.imageLoaded || !this.image.src) {
              return;
            }

            const img = this.image;
            const nodeWidth = node.size[0];
            const textHeight = 20; // 预留给文字的高度
            const padding = 2; // 底部留白
            
            // 计算可用高度：节点高度 - 当前 widget 的 y 坐标 - 文字高度 - 底部留白
            const availableHeight = node.size[1] - y - textHeight - padding; 
            
            if (availableHeight <= 0) return;

            // 保持比例适应 (Contain 逻辑)
            const imageAspect = img.naturalWidth / img.naturalHeight;
            const widgetAspect = nodeWidth / availableHeight;
            
            let targetWidth, targetHeight;
            
            if (imageAspect > widgetAspect) {
              targetWidth = nodeWidth;
              targetHeight = nodeWidth / imageAspect;
            } else {
              targetHeight = availableHeight;
              targetWidth = availableHeight * imageAspect;
            }
            
            // 居中计算
            const destX = (nodeWidth - targetWidth) / 2;
            // 垂直居中于可用区域
            const destY = y + (availableHeight - targetHeight) / 2;

            ctx.save();
            ctx.drawImage(img, destX, destY, targetWidth, targetHeight);
            
            // 绘制尺寸信息（在图片下方）
            // 文字颜色跟随主题，默认使用 widget 文本颜色
            ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR || "#AAA";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            // 绘制位置：图片区域结束位置 + 文字高度的一半（垂直居中）
            ctx.fillText(`${img.naturalWidth} x ${img.naturalHeight}`, nodeWidth / 2, destY + targetHeight + 14);
            ctx.restore();
          }

          computeSize(width) {
            // 返回一个最小高度，确保节点不会太小，但允许用户拉大
            // 确保有足够的空间显示文字和图片
            return [width, 230];
          }

          updateSource(url) {
             if (this.image.src !== url) {
                this.image.src = url;
             }
          }
        }

        const previewWidget = new PMPreviewWidget(this);
        this.addCustomWidget(previewWidget);
        
        // 兼容旧代码的 updateSource 调用
        previewWidget.updateSource = function() {
          const imageWidget = node.widgets.find(w => w.name === 'image');
          if (!imageWidget || !imageWidget.value) {
            this.image.src = "";
            this.imageLoaded = false;
            return;
          }
          
          const filename = imageWidget.value;
          const type = node.pm_directory_type || "input";
          
          const params = new URLSearchParams({
            filename: filename,
            type: type,
            rand: Math.random()
          });
          
          const url = api.apiURL('/view?' + params.toString());
          // 调用类方法更新
          PMPreviewWidget.prototype.updateSource.call(this, url);
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
        
        // 优先从 pm_selected_image 读取带标注的完整路径
        let savedValue = info.pm_selected_image;
        
        // 如果没有 pm_selected_image，则尝试从 widgets_values 读取
        if (!savedValue && info.widgets_values && info.widgets_values.length > 0) {
          savedValue = info.widgets_values[0];
        }
        
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
