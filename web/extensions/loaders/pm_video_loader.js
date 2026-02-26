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

export async function openPMInputManagerForVideo(node, directoryType = 'input') {
  const manager = findPMInputManager();
  if (manager && manager.dialog) {
    await manager.dialog.show({
      hideEmptyFolders: true,
      fixedFilter: 'video',
      disableNewFolder: true,
      directoryType: directoryType,
      selectionCallback: (videoPath) => {
        if (node.widgets) {
          const videoWidget = node.widgets.find(w => w.name === 'video');
          if (videoWidget) {
            videoWidget.value = videoPath;
            node.pm_selected_video = videoPath;
            node.pm_directory_type = directoryType;
            // 标记这是从PM管理器选择的文件，不是手动切换下拉框
            node._pm_selecting_file = true;
            if (videoWidget.callback) {
              videoWidget.callback(videoPath);
            }
            node._pm_selecting_file = false;
          }
        }
      }
    });
  } else {
    console.error("PM Input Manager not found");
  }
}

function chainCallback(object, property, callback) {
  if (object) {
    const orig = object[property];
    object[property] = function() {
      const origReturn = orig ? orig.apply(this, arguments) : undefined;
      const newReturn = callback.apply(this, arguments);
      return newReturn !== undefined ? newReturn : origReturn;
    };
  }
}

function fitHeight(node) {
  node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]]);
  node?.graph?.setDirtyCanvas(true);
}

// VHS 自定义控件相关函数
function button_action(widget) {
  if (
    widget.options?.reset == undefined &&
    widget.options?.disable == undefined
  ) {
    return 'None';
  }
  if (
    widget.options.reset != undefined &&
    widget.value != widget.options.reset
  ) {
    return 'Reset';
  }
  if (
    widget.options.disable != undefined &&
    widget.value != widget.options.disable
  ) {
    return 'Disable';
  }
  if (widget.options.reset != undefined) {
    return 'No Reset';
  }
  return 'No Disable';
}

function fitText(ctx, text, maxLength) {
  if (maxLength <= 0) {
    return ['', 0];
  }
  let fullLength = ctx.measureText(text).width;
  if (fullLength < maxLength) {
    return [text, fullLength];
  }
  let cutoff = maxLength / fullLength * text.length | 0;
  let shortened = text.slice(0, Math.max(0, cutoff - 2)) + '…';
  return [shortened, ctx.measureText(shortened).width];
}

function roundToPrecision(num, precision) {
  let strnum = Number(num).toFixed(precision);
  let deci = strnum.indexOf('.');
  if (deci > 0) {
    let i = strnum.length - 1;
    while (i > deci && strnum[i] == '0') {
      i--;
    }
    if (i == deci) {
      i--;
    }
    return strnum.slice(0, i + 1);
  }
  return strnum;
}

function inner_value_change(widget, value, node, pos) {
  widget.value = value;
  if (widget.options?.property && widget.options.property in node.properties) {
    node.setProperty(widget.options.property, value);
  }
  if (widget.callback) {
    widget.callback(widget.value, app.canvas, node, event);
  }
}

function drawAnnotated(ctx, node, widget_width, y, H) {
  const litegraph_base = LiteGraph;
  const show_text = LiteGraph.vueNodesMode || app.canvas.ds.scale >= (app.canvas.low_quality_zoom_threshold ?? 0.5);
  const margin = 15;
  ctx.strokeStyle = litegraph_base.WIDGET_OUTLINE_COLOR;
  ctx.fillStyle = litegraph_base.WIDGET_BGCOLOR;
  ctx.beginPath();
  if (show_text)
    ctx.roundRect(margin, y, widget_width - margin * 2, H, [H * 0.5]);
  else
    ctx.rect(margin, y, widget_width - margin * 2, H);
  ctx.fill();
  if (show_text) {
    if (!this.disabled) ctx.stroke();
    const button = button_action(this);
    if (button != 'None') {
      ctx.save();
      if (button.startsWith('No ')) {
        ctx.fillStyle = litegraph_base.WIDGET_OUTLINE_COLOR;
        ctx.strokeStyle = litegraph_base.WIDGET_OUTLINE_COLOR;
      } else {
        ctx.fillStyle = litegraph_base.WIDGET_TEXT_COLOR;
        ctx.strokeStyle = litegraph_base.WIDGET_TEXT_COLOR;
      }
      ctx.beginPath();
      if (button.endsWith('Reset')) {
        ctx.arc(widget_width - margin - 26, y + H / 2, 4, Math.PI * 3 / 2, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(widget_width - margin - 26, y + H / 2 - 1.5);
        ctx.lineTo(widget_width - margin - 26, y + H / 2 - 6.5);
        ctx.lineTo(widget_width - margin - 30, y + H / 2 - 3.5);
        ctx.fill();
      } else {
        ctx.arc(widget_width - margin - 26, y + H / 2, 4, Math.PI * 2 / 3, Math.PI * 8 / 3);
        ctx.moveTo(widget_width - margin - 26 - 8 ** .5, y + H / 2 + 8 ** .5);
        ctx.lineTo(widget_width - margin - 26 + 8 ** .5, y + H / 2 - 8 ** .5);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = litegraph_base.WIDGET_TEXT_COLOR;
    if (!this.disabled) {
      ctx.beginPath();
      ctx.moveTo(margin + 16, y + 5);
      ctx.lineTo(margin + 6, y + H * 0.5);
      ctx.lineTo(margin + 16, y + H - 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(widget_width - margin - 16, y + 5);
      ctx.lineTo(widget_width - margin - 6, y + H * 0.5);
      ctx.lineTo(widget_width - margin - 16, y + H - 5);
      ctx.fill();
    }
    let freeWidth = widget_width - (40 + margin * 2 + 20);
    let [valueText, valueWidth] = fitText(ctx, (this.displayValue?.() ?? ""), freeWidth);
    freeWidth -= valueWidth;

    ctx.textAlign = 'left';
    ctx.fillStyle = litegraph_base.WIDGET_SECONDARY_TEXT_COLOR;
    if (freeWidth > 20) {
      let [name, nameWidth] = fitText(ctx, this.label || this.name, freeWidth);
      freeWidth -= nameWidth;
      ctx.fillText(name, margin * 2 + 5, y + H * 0.7);
    }

    let value_offset = margin * 2 + 20;
    ctx.textAlign = 'right';
    if (this.options.unit) {
      ctx.fillStyle = litegraph_base.WIDGET_OUTLINE_COLOR;
      let [unitText, unitWidth] = fitText(ctx, this.options.unit, freeWidth);
      if (unitText == this.options.unit) {
        ctx.fillText(this.options.unit, widget_width - value_offset, y + H * 0.7);
        value_offset += unitWidth;
        freeWidth -= unitWidth;
      }
    }
    ctx.fillStyle = litegraph_base.WIDGET_TEXT_COLOR;
    ctx.fillText(valueText, widget_width - value_offset, y + H * 0.7);
    ctx.fillStyle = litegraph_base.WIDGET_SECONDARY_TEXT_COLOR;

    let annotation = '';
    if (this.annotation) {
      annotation = this.annotation(this.value, freeWidth);
    } else if (
      this.options.annotation &&
      this.value in this.options.annotation
    ) {
      annotation = this.options.annotation[this.value];
    }
    if (annotation) {
      ctx.fillStyle = litegraph_base.WIDGET_OUTLINE_COLOR;
      let [annoDisplay, annoWidth] = fitText(ctx, annotation, freeWidth);
      ctx.fillText(
        annoDisplay,
        widget_width - 5 - valueWidth - value_offset,
        y + H * 0.7
      );
    }
  }
}

function mouseAnnotated(event, [x, y], node) {
  const widget_width = this.width || node.size[0];
  const old_value = this.value;
  const margin = 15;
  let isButton = 0;
  if (x > margin + 6 && x < margin + 16) {
    isButton = -1;
  } else if (x > widget_width - margin - 16 && x < widget_width - margin - 6) {
    isButton = 1;
  } else if (x > widget_width - margin - 34 && x < widget_width - margin - 18) {
    isButton = 2;
  }
  var allow_scroll = true;
  if (allow_scroll && event.type == 'pointermove') {
    if (event.deltaX)
      this.value += event.deltaX * (this.options.step || 1);
    if (this.options.min != null && this.value < this.options.min) {
      this.value = this.options.min;
    }
    if (this.options.max != null && this.value > this.options.max) {
      this.value = this.options.max;
    }
  } else if (event.type == 'pointerdown') {
    const buttonType = button_action(this);
    if (isButton == 2) {
      if (buttonType == 'Reset') {
        this.value = this.options.reset;
      } else if (buttonType == 'Disable') {
        this.value = this.options.disable;
      }
    } else {
      this.value += isButton * (this.options.step || 1);
      if (this.options.min != null && this.value < this.options.min) {
        this.value = this.options.min;
      }
      if (this.options.max != null && this.value > this.options.max) {
        this.value = this.options.max;
      }
    }
  } else if (event.type == 'pointerup') {
    if (event.click_time < 200 && !isButton) {
      const d_callback = (v) => {
        this.value = this.parseValue?.(v) ?? Number(v);
        inner_value_change(this, this.value, node, [x, y]);
      };
      const dialog = app.canvas.prompt(
        'Value',
        this.value,
        d_callback,
        event
      );
      const input = dialog.querySelector(".value");
      input.addEventListener("keydown", (e) => {
        if (e.keyCode == 9) {
          e.preventDefault();
          e.stopPropagation();
          d_callback(input.value);
          dialog.close();
          node?.graph?.setDirtyCanvas(true);
          let i = node.widgets.findIndex((w) => w == this);
          if (e.shiftKey)
            i--;
          else
            i++;
          if (node.widgets[i]?.type == "PM.ANNOTATED") {
            node.widgets[i]?.mouse(event, [x, y + 24], node);
          }
        }
      });
    }
  }

  if (old_value != this.value)
    setTimeout(
      function () {
        inner_value_change(this, this.value, node, [x, y]);
      }.bind(this),
      20
    );
  return true;
}

app.registerExtension({
  name: "ComfyUI.PMVideoLoader",
  async getCustomWidgets() {
    return {
      PMFLOAT(node, inputName, inputData) {
        let w = {
          name: inputName,
          type: "PM.ANNOTATED",
          value: inputData[1]?.default ?? 0,
          draw: drawAnnotated,
          mouse: mouseAnnotated,
          computeSize(width) {
            return [width, 20];
          },
          callback(v) {
            if (this.options.round) {
              v = Math.round((v + Number.EPSILON) /
                this.options.round) * this.options.round;
            }
            if (this.options.max && v > this.options.max) {
              v = this.options.max;
            }
            if (this.options.min && v < this.options.min) {
              v = this.options.min;
            }
            this.value = v;
          },
          config: inputData,
          displayValue: function () {
            return roundToPrecision(this.value, this.options.precision ?? 3);
          },
          options: Object.assign({}, inputData[1])
        };
        if (!node.widgets) {
          node.widgets = [];
        }
        node.widgets.push(w);
        return w;
      },
      PMINT(node, inputName, inputData) {
        let w = {
          name: inputName,
          type: "PM.ANNOTATED",
          value: inputData[1]?.default ?? 0,
          draw: drawAnnotated,
          mouse: mouseAnnotated,
          computeSize(width) {
            return [width, 20];
          },
          callback(v) {
            if (this.options.max && v > this.options.max) {
              v = this.options.max;
            }
            if (this.options.min && v < this.options.min) {
              v = this.options.min;
            }
            if (v == 0) {
              return;
            }
            const s = this.options.step || 1;
            let sh = this.options.mod ?? 0;
            this.value = Math.round((v - sh) / s) * s + sh;
          },
          config: inputData,
          displayValue: function () {
            return this.value | 0;
          },
          options: Object.assign({}, inputData[1])
        };
        if (!node.widgets) {
          node.widgets = [];
        }
        node.widgets.push(w);
        return w;
      }
    };
  },
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeType.comfyClass === "PMLoadVideo") {
      // 为 PMLoadVideo 节点的 INT 和 FLOAT 输入设置自定义 widget 类型
      if (nodeData?.input) {
        for (let inp of Object.values({ ...nodeData.input?.required, ...nodeData.input?.optional })) {
          if (["INT", "FLOAT"].includes(inp[0])) {
            if (!inp[1]) {
              inp[1] = {};
            }
            inp[1].widgetType ??= "PM" + inp[0];
          }
        }
      }

      const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function() {
        if (originalOnNodeCreated) {
          originalOnNodeCreated.apply(this, arguments);
        }
        
        this.serialize_widgets = true;
        this.pm_selected_video = null;
        
        const node = this;
        const pathWidget = this.widgets.find((w) => w.name === "video");
        const fileInput = document.createElement("input");
        
        const onNodeRemoved = this.onRemoved;
        this.onRemoved = () => {
          fileInput?.remove();
          if (onNodeRemoved) {
            onNodeRemoved.apply(this, arguments);
          }
        };
        
        const videoAccept = ["video/mp4", "video/webm", "video/avi", "video/quicktime", "video/x-matroska"];
        
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
          accept: videoAccept.join(','),
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
          if (videoAccept.includes(item?.type) || item?.name?.toLowerCase().match(/\.(mp4|webm|avi|mov|mkv)$/)) {
            return await doUpload(item);
          }
          return false;
        };
        
        document.body.append(fileInput);
        
        let uploadWidget = this.addWidget("button", "上传视频", "video", () => {
          app.canvas.node_widget = null;
          fileInput.click();
        });
        uploadWidget.options.serialize = false;
        
        this.addWidget("button", "从输入选择文件", null, async () => {
          await openPMInputManagerForVideo(this, 'input');
        });
        this.addWidget("button", "从输出选择文件", null, async () => {
          await openPMInputManagerForVideo(this, 'output');
        });
        
        // 创建视频预览容器，使用 Canvas 尺寸逻辑
        var container = document.createElement("div");
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.overflow = "hidden";
        container.style.visibility = "hidden"; // 加载完成前隐藏
        
        var element = document.createElement("video");
        element.controls = true;
        element.autoplay = true;
        element.loop = true;
        element.muted = true;
        element.style.width = "100%";  // 宽度填满节点
        element.style.height = "100%";
        element.style.objectFit = "contain"; // 保持比例适应
        container.appendChild(element);
        
        const previewNode = this;
        var previewWidget = this.addDOMWidget("videopreview", "preview", container, {
          serialize: false,
          hideOnZoom: true,
          getValue() {
            return element.value;
          },
          setValue(v) {
            element.value = v;
          },
        });
        
        // 使用类似图片加载器的尺寸计算逻辑
        previewWidget.computeSize = function(width) {
          if (this.aspectRatio && !container.hidden) {
            // 参考图片加载器的逻辑：最小高度 230，宽度自适应
            let height = width / this.aspectRatio;
            if (!(height > 0)) {
              height = 230;
            }
            // 确保最小高度
            if (height < 230) {
              height = 230;
            }
            this.computedHeight = height;
            return [width, height];
          }
          return [width, 230];
        };
        
        // 更新视频容器高度的函数
        const updateContainerHeight = () => {
          if (previewWidget && container) {
            const widgetY = previewWidget.y || 0;
            const otherWidgetsHeight = widgetY + 30; // 预览图上方控件高度 + 底部留白
            const availableHeight = Math.max(230, previewNode.size[1] - otherWidgetsHeight);
            container.style.height = availableHeight + "px";
          }
        };
        
        // 监听节点尺寸变化，更新视频容器高度
        const originalOnResize = this.onResize;
        this.onResize = function(size) {
          if (originalOnResize) {
            originalOnResize.apply(this, arguments);
          }
          updateContainerHeight();
        };
        
        element.addEventListener("loadedmetadata", () => {
          previewWidget.aspectRatio = element.videoWidth / element.videoHeight;
          // 显示容器
          container.style.visibility = "visible";
          // 只在首次加载或节点高度过小时调整高度，避免切换视频时重置高度
          const minRequiredHeight = previewWidget.computedHeight + 200; // 预览图高度 + 其他控件高度
          if (previewNode.size[1] < minRequiredHeight) {
            fitHeight(previewNode);
          }
          // 更新容器高度以适配当前节点高度
          setTimeout(updateContainerHeight, 0);
        });
        
        element.addEventListener("error", () => {
          container.hidden = true;
        });
        
        previewWidget.value = { params: {} };
        previewWidget.updateSource = function () {
          // 切换视频源时先隐藏容器，等加载完成后再显示
          container.style.visibility = "hidden";
          
          if (!this.value.params || !this.value.params.filename) {
            return;
          }
          let params = {};
          Object.assign(params, this.value.params);
          params.timestamp = Date.now();
          
          const widthWidget = node.widgets?.find((w) => w.name === "custom_width");
          const heightWidget = node.widgets?.find((w) => w.name === "custom_height");
          
          let target_width = (node.size[0]-20)*2 || 256;
          let minWidth = 256;
          if (target_width < minWidth) {
            target_width = minWidth;
          }
          
          if (widthWidget && heightWidget && widthWidget.value && heightWidget.value) {
            let ar = widthWidget.value / heightWidget.value;
            params.force_size = target_width+"x"+(target_width/ar);
          } else if (widthWidget && widthWidget.value) {
            params.force_size = widthWidget.value+"x?";
          } else if (heightWidget && heightWidget.value) {
            params.force_size = "?x"+heightWidget.value;
          } else {
            params.force_size = target_width+"x?";
          }
          
          element.src = api.apiURL('/pm/viewvideo?' + new URLSearchParams(params));
          
          delete node.video_query;
          const doQuery = async () => {
            if (!previewWidget?.value?.params?.filename) {
              return;
            }
            let qurl = api.apiURL('/pm/queryvideo?' + new URLSearchParams(previewWidget.value.params));
            let query = undefined;
            try {
              let query_res = await fetch(qurl);
              query = await query_res.json();
            } catch(e) {
              return;
            }
            node.video_query = query;
            updateWidgetAnnotations(node);
          };
          doQuery();
        };
        
        this.updateParameters = (params, force_update) => {
          if (!previewWidget.value.params) {
            if(typeof(previewWidget.value) != 'object') {
              previewWidget.value =  {hidden: false, paused: false};
            }
            previewWidget.value.params = {};
          }
          if (!force_update && !Object.entries(params).some(([k,v]) => previewWidget.value.params[k] !== v)) {
            return;
          }
          Object.assign(previewWidget.value.params, params);
          previewWidget.updateSource();
        };
        
        const updateVideoSource = (filename) => {
          if (filename) {
            previewWidget.value.params = { 
              filename: filename, 
              type: node.pm_directory_type || "input",
              force_rate: node.widgets?.find((w) => w.name === "force_rate")?.value,
              frame_load_cap: node.widgets?.find((w) => w.name === "frame_load_cap")?.value,
              skip_first_frames: node.widgets?.find((w) => w.name === "skip_first_frames")?.value,
              select_every_nth: node.widgets?.find((w) => w.name === "select_every_nth")?.value,
              custom_width: node.widgets?.find((w) => w.name === "custom_width")?.value,
              custom_height: node.widgets?.find((w) => w.name === "custom_height")?.value
            };
            previewWidget.updateSource();
          }
        };
        
        const updateWidgetAnnotations = (node) => {
          if (!node.video_query) return;
          
          const forceRateWidget = node.widgets?.find((w) => w.name === "force_rate");
          if (forceRateWidget) {
            const originalRate = node.video_query.source?.fps || 0;
            forceRateWidget.annotation = (value, width) => {
              if (value == 0 && originalRate != undefined) {
                return roundToPrecision(originalRate, 2) + "\u21FD";
              }
            };
          }
          
          const frameLoadCapWidget = node.widgets?.find((w) => w.name === "frame_load_cap");
          if (frameLoadCapWidget) {
            const totalFrames = node.video_query.source?.frames || 0;
            const maxFrames = node.video_query.loaded?.frames;
            frameLoadCapWidget.annotation = (value, width) => {
              if (!maxFrames || value && value < maxFrames) {
                return;
              }
              return maxFrames + "\u21FD";
            };
          }
          
          const customWidthWidget = node.widgets?.find((w) => w.name === "custom_width");
          if (customWidthWidget) {
            const originalWidth = node.video_query.source?.size?.[0] || 0;
            customWidthWidget.annotation = (value, width) => {
              if (value == 0 && originalWidth != undefined) {
                return originalWidth + "\u21FD";
              }
            };
          }
          
          const customHeightWidget = node.widgets?.find((w) => w.name === "custom_height");
          if (customHeightWidget) {
            const originalHeight = node.video_query.source?.size?.[1] || 0;
            customHeightWidget.annotation = (value, width) => {
              if (value == 0 && originalHeight != undefined) {
                return originalHeight + "\u21FD";
              }
            };
          }
        };
        
        const widthWidget = this.widgets.find((w) => w.name === "custom_width");
        const heightWidget = this.widgets.find((w) => w.name === "custom_height");
        let prior_ar = -2;
        
        function updateAR(value) {
          let new_ar = -1;
          if (widthWidget && heightWidget && widthWidget.value && heightWidget.value) {
            new_ar = widthWidget.value / heightWidget.value;
          }
          if (new_ar != prior_ar) {
            node?.updateParameters({
              'custom_width': widthWidget?.value, 
              'custom_height': heightWidget?.value,
              'force_rate': node.widgets?.find((w) => w.name === "force_rate")?.value,
              'frame_load_cap': node.widgets?.find((w) => w.name === "frame_load_cap")?.value,
              'skip_first_frames': node.widgets?.find((w) => w.name === "skip_first_frames")?.value,
              'select_every_nth': node.widgets?.find((w) => w.name === "select_every_nth")?.value
            }, true);
            prior_ar = new_ar;
            updateWidgetAnnotations(node);
          }
        }
        
        function update(key) {
          return function(value) {
            let params = {};
            params[key] = this.value;
            node?.updateParameters(params, true);
            updateWidgetAnnotations(node);
          };
        }
        
        let widgetMap = {
          'frame_load_cap': 'frame_load_cap',
          'skip_first_frames': 'skip_first_frames', 
          'select_every_nth': 'select_every_nth',
          'force_rate': 'force_rate',
          'custom_width': updateAR, 
          'custom_height': updateAR
        };
        
        for (let widget of this.widgets) {
          if (widget.name in widgetMap) {
            if (typeof(widgetMap[widget.name]) == 'function') {
              chainCallback(widget, "callback", widgetMap[widget.name]);
            } else {
              chainCallback(widget, "callback", update(widgetMap[widget.name]));
            }
          }
          if (widget.type != "button") {
            widget.callback?.(widget.value);
          }
        }
        
        if (pathWidget) {
          const originalCallback = pathWidget.callback;
          pathWidget.callback = function(filename) {
            if (originalCallback) {
              originalCallback.call(this, filename);
            }
            // 只有当不是从PM管理器选择文件时，才重置 directory_type 为 input
            // 因为下拉框中的文件默认都来自 input 目录
            if (!node._pm_selecting_file) {
              node.pm_directory_type = "input";
            }
            updateVideoSource(filename);
          };

          if (pathWidget.value) {
            setTimeout(() => {
              updateVideoSource(pathWidget.value);
            }, 50);
          }
        }
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

        if (info.widgets_values && info.widgets_values.length > 0) {
          const savedValue = info.widgets_values[0];
          if (savedValue) {
            this.pm_selected_video = savedValue;

            setTimeout(() => {
              const pathWidget = this.widgets?.find((w) => w.name === "video");
              if (pathWidget && pathWidget.value) {
                const updateVideoSourceFunc = (filename) => {
                  if (filename) {
                    const previewWidget = this.widgets?.find((w) => w.name === "videopreview");
                    if (previewWidget) {
                      previewWidget.value.params = {
                        filename: filename,
                        type: this.pm_directory_type || "input",
                        force_rate: this.widgets?.find((w) => w.name === "force_rate")?.value,
                        frame_load_cap: this.widgets?.find((w) => w.name === "frame_load_cap")?.value,
                        skip_first_frames: this.widgets?.find((w) => w.name === "skip_first_frames")?.value,
                        select_every_nth: this.widgets?.find((w) => w.name === "select_every_nth")?.value,
                        custom_width: this.widgets?.find((w) => w.name === "custom_width")?.value,
                        custom_height: this.widgets?.find((w) => w.name === "custom_height")?.value
                      };
                      previewWidget.updateSource?.();
                    }
                  }
                };
                updateVideoSourceFunc(pathWidget.value);
              }
            }, 100);
          }
        }
      };

      // 保存 directory_type 到序列化数据
      const originalOnSerialize = nodeType.prototype.onSerialize;
      nodeType.prototype.onSerialize = function(info) {
        if (originalOnSerialize) {
          originalOnSerialize.apply(this, arguments);
        }
        if (this.pm_directory_type) {
          info.pm_directory_type = this.pm_directory_type;
        }
      };
    }
  }
});
