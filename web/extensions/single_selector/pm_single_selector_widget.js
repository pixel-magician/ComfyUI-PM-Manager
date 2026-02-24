
import { createDragHandle, createToggle, updateEntrySelection } from "./pm_single_selector_components.js";
import { parseValue, formatValue, updateWidgetHeight, ENTRY_HEIGHT, CONTAINER_PADDING, EMPTY_CONTAINER_HEIGHT } from "./pm_single_selector_utils.js";
import { ensurePmStyles } from "../common/pm_styles_loader.js";
import { PreviewTooltip } from "../common/preview_tooltip.js";
import { createSingleSelectorContextMenu } from "./pm_single_selector_context_menu.js";
import { fetchWithUser } from "../pm_model.js";
import { app } from "/scripts/app.js";

if (typeof window.lastMouseX === 'undefined') {
  window.lastMouseX = 0;
  window.lastMouseY = 0;
  document.addEventListener('mousemove', (e) => {
    window.lastMouseX = e.clientX;
    window.lastMouseY = e.clientY;
  }, { passive: true });
}

if (typeof window.pmDragState === 'undefined') {
  window.pmDragState = {
    draggingName: null,
    sourceContainer: null
  };
}

export function createSingleSelectorWidget(config) {
  const {
    containerClass,
    entryClass,
    dragHandleClass,
    toggleClass,
    nameClass,
    emptyStateClass,
    contextMenuClass,
    modelType,
    emptyMessage,
    defaultHeight = 180,
    openDetailsFn
  } = config;

  return function addWidget(node, name, opts, callback) {
    ensurePmStyles();

    const container = document.createElement("div");
    container.className = containerClass;

    const previewTooltip = new PreviewTooltip({ modelType });

    const defaultValue = opts?.defaultVal || [];

    let selectedModel = null;
    let currentModelsData = parseValue(defaultValue);

    const renderModels = (value, widget) => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      const modelsData = parseValue(value);
      currentModelsData = modelsData;

      const updateWidgetValue = (newValue) => {
        widget.value = newValue;
        if (typeof widget.callback === "function") {
          widget.callback(widget.value);
        }
      };

      if (modelsData.length === 0) {
        const emptyMessageEl = document.createElement("div");
        emptyMessageEl.textContent = emptyMessage;
        emptyMessageEl.className = emptyStateClass;
        container.appendChild(emptyMessageEl);
        updateWidgetHeight(container, EMPTY_CONTAINER_HEIGHT, defaultHeight, node);
        return;
      }

      let totalVisibleEntries = modelsData.length;

      modelsData.forEach((modelData, index) => {
        const { name: modelName, selected } = modelData;

        const modelEl = document.createElement("div");
        modelEl.className = entryClass;
        modelEl.dataset.modelName = modelName;
        modelEl.dataset.selected = selected ? "true" : "false";

        if (selected) {
          modelEl.classList.add('selected');
          selectedModel = modelName;
        }

        modelEl.addEventListener('click', (e) => {
          if (e.target.closest(`.${dragHandleClass}`)) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();

          const newModelsData = modelsData.map((m) => ({
            ...m,
            selected: m.name === modelName
          }));
          updateWidgetValue(formatValue(newModelsData));
          renderModels(widget.value, widget);
        });

        const dragHandle = createDragHandle(dragHandleClass);

        const dropIndicator = document.createElement('div');
        dropIndicator.className = 'pm-drop-indicator';
        dropIndicator.style.cssText = `
          position: absolute;
          left: -6px;
          right: -6px;
          height: 6px;
          background: linear-gradient(90deg, #4ade80, #22c55e, #4ade80);
          background-size: 200% 100%;
          border-radius: 3px;
          z-index: 9999;
          box-shadow: 0 0 10px #4ade80, 0 0 20px rgba(74, 222, 128, 0.6);
          display: none;
          pointer-events: none;
        `;
        modelEl.appendChild(dropIndicator);

        const arrowIndicator = document.createElement('div');
        arrowIndicator.className = 'pm-arrow-indicator';
        arrowIndicator.textContent = '→';
        arrowIndicator.style.cssText = `
          position: absolute;
          left: 22px;
          top: 50%;
          transform: translateY(-50%);
          color: #4ade80;
          font-size: 16px;
          font-weight: bold;
          text-shadow: 0 0 6px #4ade80;
          z-index: 10000;
          display: none;
          pointer-events: none;
        `;
        dragHandle.appendChild(arrowIndicator);

        let indicatorAnimation = null;
        const startIndicatorAnimation = () => {
          let pos = 0;
          indicatorAnimation = setInterval(() => {
            pos += 2;
            if (pos > 200) pos = 0;
            dropIndicator.style.backgroundPosition = `${pos}% 0`;
          }, 16);
        };
        const stopIndicatorAnimation = () => {
          if (indicatorAnimation) {
            clearInterval(indicatorAnimation);
            indicatorAnimation = null;
          }
        };

        dragHandle.draggable = true;
        dragHandle.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', modelName);
          window.pmDragState.draggingName = modelName;
          window.pmDragState.sourceContainer = container;
          modelEl.classList.add('dragging');
          previewTooltip.hide();
        });

        dragHandle.addEventListener('dragend', (e) => {
          e.stopPropagation();
          modelEl.classList.remove('dragging');
          container.querySelectorAll('.pm-drop-indicator').forEach(el => {
            el.style.display = 'none';
            el.style.top = '';
            el.style.bottom = '';
          });
          container.querySelectorAll('.pm-arrow-indicator').forEach(el => {
            el.style.display = 'none';
          });
          container.querySelectorAll(`.${entryClass}`).forEach(entry => {
            entry.classList.remove('drag-target');
          });
          stopIndicatorAnimation();
          window.pmDragState.draggingName = null;
          window.pmDragState.sourceContainer = null;
        });

        modelEl.addEventListener('dragenter', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });

        modelEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';

          const draggingName = window.pmDragState.draggingName;
          if (!draggingName || draggingName === modelName) return;

          const rect = modelEl.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          container.querySelectorAll('.pm-drop-indicator').forEach(el => {
            el.style.display = 'none';
            el.style.top = '';
            el.style.bottom = '';
          });
          container.querySelectorAll('.pm-arrow-indicator').forEach(el => {
            el.style.display = 'none';
          });
          container.querySelectorAll(`.${entryClass}`).forEach(entry => {
            entry.classList.remove('drag-target');
          });
          stopIndicatorAnimation();

          if (e.clientY < midY) {
            dropIndicator.style.display = 'block';
            dropIndicator.style.top = '-4px';
            dropIndicator.style.bottom = '';
          } else {
            dropIndicator.style.display = 'block';
            dropIndicator.style.bottom = '-4px';
            dropIndicator.style.top = '';
          }
          arrowIndicator.style.display = 'block';
          modelEl.classList.add('drag-target');
          startIndicatorAnimation();
        });

        modelEl.addEventListener('dragleave', (e) => {
          e.stopPropagation();
          if (modelEl.contains(e.relatedTarget)) {
            return;
          }
          dropIndicator.style.display = 'none';
          arrowIndicator.style.display = 'none';
          modelEl.classList.remove('drag-target');
          stopIndicatorAnimation();
        });

        modelEl.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const draggingName = window.pmDragState.draggingName;
          if (!draggingName || draggingName === modelName) return;

          dropIndicator.style.display = 'none';
          arrowIndicator.style.display = 'none';
          modelEl.classList.remove('drag-target');
          stopIndicatorAnimation();

          const rect = modelEl.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          const currentModelsData = parseValue(widget.value);
          const fromIndex = currentModelsData.findIndex(m => m.name === draggingName);
          let toIndex = currentModelsData.findIndex(m => m.name === modelName);

          if (fromIndex === -1 || toIndex === -1) return;

          if (e.clientY > midY) {
            toIndex += 1;
          }
          if (fromIndex < toIndex) {
            toIndex -= 1;
          }

          const [movedItem] = currentModelsData.splice(fromIndex, 1);
          currentModelsData.splice(toIndex, 0, movedItem);

          updateWidgetValue(formatValue(currentModelsData));
          renderModels(widget.value, widget);
        });

        const toggle = createToggle(toggleClass, selected, (newSelected) => {
          if (newSelected) {
            const newModelsData = modelsData.map((m) => ({
              ...m,
              selected: m.name === modelName
            }));
            updateWidgetValue(formatValue(newModelsData));
            renderModels(widget.value, widget);
          } else {
            const hasOtherSelected = modelsData.some(m => m.name !== modelName && m.selected);
            if (hasOtherSelected) {
              const newModelsData = modelsData.map((m) => ({
                ...m,
                selected: m.name === modelName ? false : m.selected
              }));
              updateWidgetValue(formatValue(newModelsData));
              renderModels(widget.value, widget);
            }
          }
        });

        const nameEl = document.createElement("div");
        nameEl.textContent = modelName;
        nameEl.className = nameClass;

        let previewTimer = null;
        modelEl.addEventListener('mouseenter', (e) => {
          if (e.target.closest(`.${dragHandleClass}`) ||
              e.target.closest(`.${toggleClass}`)) {
            return;
          }
          e.stopPropagation();
          previewTimer = setTimeout(async () => {
            previewTimer = null;
            requestAnimationFrame(async () => {
              const rect = modelEl.getBoundingClientRect();
              if (rect.right > 0 && rect.top > 0) {
                await previewTooltip.show(modelName, rect.right, rect.top);
              }
            });
          }, 400);
        });

        modelEl.addEventListener('mouseleave', (e) => {
          e.stopPropagation();
          if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
          }
          previewTooltip.hide();
        });

        modelEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const modelsData = parseValue(widget.value);
          const currentIndex = modelsData.findIndex(m => m.name === modelName);

          createSingleSelectorContextMenu(contextMenuClass, e.clientX, e.clientY, {
            canMoveUp: currentIndex > 0,
            canMoveDown: currentIndex < modelsData.length - 1,
            onDelete: () => {
              const newModelsData = modelsData.filter(m => m.name !== modelName);
              updateWidgetValue(formatValue(newModelsData));
              renderModels(widget.value, widget);
            },
            onMoveUp: () => {
              if (currentIndex > 0) {
                const newModelsData = [...modelsData];
                [newModelsData[currentIndex], newModelsData[currentIndex - 1]] =
                  [newModelsData[currentIndex - 1], newModelsData[currentIndex]];
                updateWidgetValue(formatValue(newModelsData));
                renderModels(widget.value, widget);
              }
            },
            onMoveDown: () => {
              if (currentIndex < modelsData.length - 1) {
                const newModelsData = [...modelsData];
                [newModelsData[currentIndex], newModelsData[currentIndex + 1]] =
                  [newModelsData[currentIndex + 1], newModelsData[currentIndex]];
                updateWidgetValue(formatValue(newModelsData));
                renderModels(widget.value, widget);
              }
            },
            onViewDetails: () => {
              openDetailsFn(modelName);
            }
          });
        });

        const leftSection = document.createElement("div");
        leftSection.className = entryClass + "-left";
        leftSection.appendChild(dragHandle);
        leftSection.appendChild(toggle);
        leftSection.appendChild(nameEl);

        modelEl.appendChild(leftSection);
        container.appendChild(modelEl);
      });

      const calculatedHeight = CONTAINER_PADDING * 2 + (totalVisibleEntries * ENTRY_HEIGHT);
      updateWidgetHeight(container, calculatedHeight, defaultHeight, node);

      requestAnimationFrame(() => {
        const entries = container.querySelectorAll(`.${entryClass}`);
        entries.forEach(entry => {
          const rect = entry.getBoundingClientRect();
          if (window.lastMouseX >= rect.left && window.lastMouseX <= rect.right &&
              window.lastMouseY >= rect.top && window.lastMouseY <= rect.bottom) {
            entry.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
        });
      });
    };

    let widgetValue = defaultValue;

    const widget = node.addDOMWidget(name, "custom", container, {
      getValue: function() {
        return widgetValue;
      },
      setValue: function(v) {
        const uniqueValue = (v || []).reduce((acc, model) => {
          const filtered = acc.filter(m => m.name !== model.name);
          return [...filtered, model];
        }, []);

        const updatedValue = uniqueValue.map(model => ({
          ...model,
          selected: model.hasOwnProperty('selected') ? model.selected : false
        }));

        widgetValue = updatedValue;
        renderModels(widgetValue, widget);
      },
      hideOnZoom: true,
      selectOn: ['click', 'focus']
    });

    widget.value = defaultValue;
    widget.callback = callback;

    renderModels(widget.value, widget);

    widget.onRemove = () => {
      previewTooltip.cleanup();
      container.remove();
    };

    return { minWidth: 400, minHeight: defaultHeight, widget };
  };
}

export function createOpenDetailsFn(searchPathPrefix) {
  return async function openDetails(modelName) {
    for (const ext of app.extensions) {
      if (ext.name === "ComfyUI.PMModelManager") {
        const dialog = ext.pmModelDialog;
        if (dialog) {
          let foundItem = null;

          try {
            const searchInPath = async (path = "") => {
              const response = await fetchWithUser(`/pm_model/list?path=${encodeURIComponent(path)}`);
              const data = await response.json();

              for (const item of (data.items || [])) {
                if (item.type === 'model') {
                  const itemName = item.name.replace(/\.[^/.]+$/, '');
                  if (itemName === modelName || item.name === modelName) {
                    foundItem = item;
                    return true;
                  }
                }
                if (item.type === 'folder') {
                  const folderPath = path ? `${path}/${item.name}` : item.name;
                  if (await searchInPath(folderPath)) {
                    return true;
                  }
                }
              }
              return false;
            };

            await searchInPath();
          } catch (error) {
            console.error('Error finding model:', error);
          }

          if (foundItem) {
            dialog.showInfoDialog(foundItem);
          } else {
            console.warn('Model not found:', modelName);
          }
        }
        break;
      }
    }
  };
}
