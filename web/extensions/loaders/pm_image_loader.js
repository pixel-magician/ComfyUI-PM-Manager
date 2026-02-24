import { app } from "/scripts/app.js";

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
            imageWidget.value = imagePath;
            node.pm_selected_image = imagePath;
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
        
        // 在原始 widgets 之后添加我们的按钮
        this.addWidget("button", "从输入选择文件", null, async () => {
          await openPMInputManagerForImage(this, 'input');
        });
        this.addWidget("button", "从输出选择文件", null, async () => {
          await openPMInputManagerForImage(this, 'output');
        });
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
          }
        }
      };
    }
  }
});

