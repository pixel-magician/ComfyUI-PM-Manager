
import { createToggle, createDragHandle, createExpandButton, createStrengthControl, updateEntrySelection } from "./loras_widget_components.js";
import { parseLoraValue, formatLoraValue, updateWidgetHeight, LORA_ENTRY_HEIGHT, HEADER_HEIGHT, CONTAINER_PADDING, EMPTY_CONTAINER_HEIGHT } from "./loras_widget_utils.js";
import { ensurePmStyles } from "../common/pm_styles_loader.js";
import { PreviewTooltip } from "../common/preview_tooltip.js";
import { createLoraContextMenu } from "./loras_context_menu.js";
import { fetchWithUser } from "../pm_model.js";
import { app } from "/scripts/app.js";
import { t, initPromise, onLocaleChange } from "../common/i18n.js";

// Global mouse position tracking for preview tooltip
if (typeof window.lastMouseX === 'undefined') {
  window.lastMouseX = 0;
  window.lastMouseY = 0;
  document.addEventListener('mousemove', (e) => {
    window.lastMouseX = e.clientX;
    window.lastMouseY = e.clientY;
  }, { passive: true });
}

// Global drag state (shared with unets_widget)
if (typeof window.pmDragState === 'undefined') {
  window.pmDragState = {
    draggingName: null,
    sourceContainer: null
  };
}

export async function addLorasWidget(node, name, opts, callback) {
  // 等待翻译加载完成
  await initPromise;

  ensurePmStyles();

  const container = document.createElement("div");
  container.className = "pm-loras-container";

  const previewTooltip = new PreviewTooltip({ modelType: "loras" });

  const defaultHeight = 180;
  const defaultValue = opts?.defaultVal || [];
  const onSelectionChange = typeof opts?.onSelectionChange === "function"
    ? opts.onSelectionChange
    : null;

  let selectedLora = null;
  let currentLorasData = parseLoraValue(defaultValue);
  let lastSelectionKey = "__none__";

  const buildSelectionPayload = (loraName) => {
    if (!loraName) {
      return null;
    }
    const entry = currentLorasData.find((lora) => lora.name === loraName);
    if (!entry) {
      return null;
    }
    return {
      name: entry.name,
      active: !!entry.active,
      entry: { ...entry },
    };
  };

  const emitSelectionChange = (payload, options = {}) => {
    if (!onSelectionChange) {
      return;
    }
    const key = payload
      ? `${payload.name || ""}|${payload.active ? "1" : "0"}`
      : "__null__";
    if (!options.force && key === lastSelectionKey) {
      return;
    }
    lastSelectionKey = key;
    onSelectionChange(payload);
  };

  const selectLora = (loraName, options = {}) => {
    selectedLora = loraName;
    container.querySelectorAll('.pm-lora-entry').forEach(entry => {
      const entryLoraName = entry.dataset.loraName;
      updateEntrySelection(entry, entryLoraName === selectedLora);
    });
    if (!options.silent) {
      emitSelectionChange(buildSelectionPayload(loraName));
    }
  };

  const renderLoras = (value, widget) => {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const lorasData = parseLoraValue(value);
    currentLorasData = lorasData;

    const updateWidgetValue = (newValue) => {
      widget.value = newValue;
      if (typeof widget.callback === "function") {
        widget.callback(widget.value);
      }
    };

    if (lorasData.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.textContent = t('noLorasAdded', 'No LoRAs added');
      emptyMessage.className = "pm-lora-empty-state";
      container.appendChild(emptyMessage);
      updateWidgetHeight(container, EMPTY_CONTAINER_HEIGHT, defaultHeight, node);
      return;
    }

    const header = document.createElement("div");
    header.className = "pm-loras-header";

    const allActive = lorasData.every(lora => lora.active);
    const toggleAll = createToggle(allActive, (active) => {
      const lorasData = parseLoraValue(widget.value);
      lorasData.forEach(lora => lora.active = active);
      const newValue = formatLoraValue(lorasData);
      updateWidgetValue(newValue);
    });

    const toggleLabel = document.createElement("div");
    toggleLabel.textContent = t('toggleAll', 'Toggle All');
    toggleLabel.className = "pm-toggle-label";

    const toggleContainer = document.createElement("div");
    toggleContainer.className = "pm-toggle-container";
    toggleContainer.appendChild(toggleAll);
    toggleContainer.appendChild(toggleLabel);

    header.appendChild(toggleContainer);
    container.appendChild(header);

    let totalVisibleEntries = lorasData.length;

    lorasData.forEach((loraData) => {
      const { name, active, strength, clipStrength, expanded } = loraData;

      const loraEl = document.createElement("div");
      loraEl.className = "pm-lora-entry";
      loraEl.dataset.loraName = name;
      loraEl.dataset.active = active ? "true" : "false";

      loraEl.addEventListener('click', (e) => {
        if (e.target.closest('.pm-lora-toggle') ||
            e.target.closest('input') ||
            e.target.closest('.pm-lora-arrow') ||
            e.target.closest('.pm-lora-drag-handle') ||
            e.target.closest('.pm-lora-expand-button')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        selectLora(name);
        container.focus();
      });

      const dragHandle = createDragHandle();

      // Create drop indicator line element
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
      loraEl.appendChild(dropIndicator);

      // Create arrow indicator
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

      // Animation for drop indicator
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

      // Setup drag and drop
      dragHandle.draggable = true;
      dragHandle.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', name);
        // Store in global state for cross-event access
        window.pmDragState.draggingName = name;
        window.pmDragState.sourceContainer = container;
        loraEl.classList.add('dragging');
        previewTooltip.hide();
      });

      dragHandle.addEventListener('dragend', (e) => {
        e.stopPropagation();
        loraEl.classList.remove('dragging');
        // Hide all indicators
        container.querySelectorAll('.pm-drop-indicator').forEach(el => {
          el.style.display = 'none';
          el.style.top = '';
          el.style.bottom = '';
        });
        container.querySelectorAll('.pm-arrow-indicator').forEach(el => {
          el.style.display = 'none';
        });
        container.querySelectorAll('.pm-lora-entry').forEach(entry => {
          entry.classList.remove('drag-target');
        });
        stopIndicatorAnimation();
        // Clear global state
        window.pmDragState.draggingName = null;
        window.pmDragState.sourceContainer = null;
      });

      loraEl.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      loraEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        // Use global state instead of dataTransfer (which doesn't work in dragover)
        const draggingName = window.pmDragState.draggingName;
        if (!draggingName || draggingName === name) return;

        const rect = loraEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        // Hide all other indicators
        container.querySelectorAll('.pm-drop-indicator').forEach(el => {
          el.style.display = 'none';
          el.style.top = '';
          el.style.bottom = '';
        });
        container.querySelectorAll('.pm-arrow-indicator').forEach(el => {
          el.style.display = 'none';
        });
        container.querySelectorAll('.pm-lora-entry').forEach(entry => {
          entry.classList.remove('drag-target');
        });
        stopIndicatorAnimation();

        // Show indicator based on mouse position
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
        loraEl.classList.add('drag-target');
        startIndicatorAnimation();
      });

      loraEl.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        // Use relatedTarget to check if we're actually leaving the element
        // If relatedTarget is still within loraEl, don't hide
        if (loraEl.contains(e.relatedTarget)) {
          return;
        }
        dropIndicator.style.display = 'none';
        arrowIndicator.style.display = 'none';
        loraEl.classList.remove('drag-target');
        stopIndicatorAnimation();
      });

      loraEl.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Use global state
        const draggingName = window.pmDragState.draggingName;
        if (!draggingName || draggingName === name) return;

        dropIndicator.style.display = 'none';
        arrowIndicator.style.display = 'none';
        loraEl.classList.remove('drag-target');
        stopIndicatorAnimation();

        const rect = loraEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        const currentLorasData = parseLoraValue(widget.value);
        const fromIndex = currentLorasData.findIndex(u => u.name === draggingName);
        let toIndex = currentLorasData.findIndex(u => u.name === name);

        if (fromIndex === -1 || toIndex === -1) return;

        // Adjust target index based on drop position
        if (e.clientY > midY) {
          toIndex += 1;
        }
        if (fromIndex < toIndex) {
          toIndex -= 1;
        }

        // Reorder
        const [movedItem] = currentLorasData.splice(fromIndex, 1);
        currentLorasData.splice(toIndex, 0, movedItem);

        updateWidgetValue(formatLoraValue(currentLorasData));
        renderLoras(widget.value, widget);
      });

      const toggle = createToggle(active, (newActive) => {
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(u => u.name === name);
        if (loraIndex >= 0) {
          lorasData[loraIndex].active = newActive;
          if (selectedLora === name) {
            emitSelectionChange({
              name,
              active: newActive,
              entry: { ...lorasData[loraIndex] },
            });
          }
          const newValue = formatLoraValue(lorasData);
          updateWidgetValue(newValue);
        }
      });

      const expandButton = createExpandButton(expanded, (shouldExpand) => {
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(u => u.name === name);
        if (loraIndex >= 0) {
          lorasData[loraIndex].expanded = shouldExpand;
          updateWidgetValue(formatLoraValue(lorasData));
          renderLoras(widget.value, widget);
        }
      });

      const nameEl = document.createElement("div");
      nameEl.textContent = name;
      nameEl.className = "pm-lora-name";

      // Preview tooltip on hover (on the entire entry, not just name)
      let previewTimer = null;
      loraEl.addEventListener('mouseenter', (e) => {
        // Don't trigger if hovering over interactive elements
        if (e.target.closest('.pm-lora-drag-handle') ||
            e.target.closest('.pm-lora-toggle') ||
            e.target.closest('.pm-lora-expand-button') ||
            e.target.closest('.pm-lora-strength-wrapper')) {
          return;
        }
        e.stopPropagation();
        previewTimer = setTimeout(async () => {
          previewTimer = null;
          // Use requestAnimationFrame to ensure element is properly laid out
          requestAnimationFrame(async () => {
            const rect = loraEl.getBoundingClientRect();
            // Only show if we have valid coordinates
            if (rect.right > 0 && rect.top > 0) {
              await previewTooltip.show(name, rect.right, rect.top);
            }
          });
        }, 400);
      });

      loraEl.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
        if (previewTimer) {
          clearTimeout(previewTimer);
          previewTimer = null;
        }
        previewTooltip.hide();
      });

      // Add context menu
      loraEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const lorasData = parseLoraValue(widget.value);
        const currentIndex = lorasData.findIndex(u => u.name === name);

        createLoraContextMenu(e.clientX, e.clientY, {
          canMoveUp: currentIndex > 0,
          canMoveDown: currentIndex < lorasData.length - 1,
          onDelete: () => {
            const newLorasData = lorasData.filter(u => u.name !== name);
            updateWidgetValue(formatLoraValue(newLorasData));
            renderLoras(widget.value, widget);
          },
          onMoveUp: () => {
            if (currentIndex > 0) {
              const newLorasData = [...lorasData];
              [newLorasData[currentIndex], newLorasData[currentIndex - 1]] =
                [newLorasData[currentIndex - 1], newLorasData[currentIndex]];
              updateWidgetValue(formatLoraValue(newLorasData));
              renderLoras(widget.value, widget);
            }
          },
          onMoveDown: () => {
            if (currentIndex < lorasData.length - 1) {
              const newLorasData = [...lorasData];
              [newLorasData[currentIndex], newLorasData[currentIndex + 1]] =
                [newLorasData[currentIndex + 1], newLorasData[currentIndex]];
              updateWidgetValue(formatLoraValue(newLorasData));
              renderLoras(widget.value, widget);
            }
          },
          onViewDetails: () => {
            openLoraDetails(name);
          }
        });
      });

      const onStrengthChange = (newStrength) => {
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(u => u.name === name);
        if (loraIndex >= 0) {
          lorasData[loraIndex].strength = newStrength;
          updateWidgetValue(formatLoraValue(lorasData));
        }
      };

      const onStrengthDecrease = () => {
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(u => u.name === name);
        if (loraIndex >= 0) {
          const newStrength = Math.max(-20, lorasData[loraIndex].strength - 0.05);
          lorasData[loraIndex].strength = Math.round(newStrength * 100) / 100;
          updateWidgetValue(formatLoraValue(lorasData));
          renderLoras(widget.value, widget);
        }
      };

      const onStrengthIncrease = () => {
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(u => u.name === name);
        if (loraIndex >= 0) {
          const newStrength = Math.min(20, lorasData[loraIndex].strength + 0.05);
          lorasData[loraIndex].strength = Math.round(newStrength * 100) / 100;
          updateWidgetValue(formatLoraValue(lorasData));
          renderLoras(widget.value, widget);
        }
      };

      const { control: strengthControl } = createStrengthControl(
        strength,
        onStrengthChange,
        onStrengthDecrease,
        onStrengthIncrease
      );

      const leftSection = document.createElement("div");
      leftSection.className = "pm-lora-entry-left";
      leftSection.appendChild(dragHandle);
      leftSection.appendChild(toggle);
      leftSection.appendChild(expandButton);
      leftSection.appendChild(nameEl);

      loraEl.appendChild(leftSection);
      loraEl.appendChild(strengthControl);
      container.appendChild(loraEl);

      if (expanded) {
        const clipEntry = document.createElement('div');
        clipEntry.className = 'pm-lora-clip-entry';
        clipEntry.dataset.active = active ? "true" : "false";

        const clipLabel = document.createElement('span');
        clipLabel.className = 'pm-lora-clip-label';
        clipLabel.textContent = '[clip]';

        const clipName = document.createElement('span');
        clipName.className = 'pm-lora-name';
        clipName.textContent = name;
        clipName.style.marginLeft = '8px';

        const onClipStrengthChange = (newStrength) => {
          const lorasData = parseLoraValue(widget.value);
          const loraIndex = lorasData.findIndex(u => u.name === name);
          if (loraIndex >= 0) {
            lorasData[loraIndex].clipStrength = newStrength;
            updateWidgetValue(formatLoraValue(lorasData));
          }
        };

        const onClipStrengthDecrease = () => {
          const lorasData = parseLoraValue(widget.value);
          const loraIndex = lorasData.findIndex(u => u.name === name);
          if (loraIndex >= 0) {
            const newStrength = Math.max(-20, lorasData[loraIndex].clipStrength - 0.05);
            lorasData[loraIndex].clipStrength = Math.round(newStrength * 100) / 100;
            updateWidgetValue(formatLoraValue(lorasData));
            renderLoras(widget.value, widget);
          }
        };

        const onClipStrengthIncrease = () => {
          const lorasData = parseLoraValue(widget.value);
          const loraIndex = lorasData.findIndex(u => u.name === name);
          if (loraIndex >= 0) {
            const newStrength = Math.min(20, lorasData[loraIndex].clipStrength + 0.05);
            lorasData[loraIndex].clipStrength = Math.round(newStrength * 100) / 100;
            updateWidgetValue(formatLoraValue(lorasData));
            renderLoras(widget.value, widget);
          }
        };

        const { control: clipStrengthControl } = createStrengthControl(
          clipStrength,
          onClipStrengthChange,
          onClipStrengthDecrease,
          onClipStrengthIncrease
        );

        const clipLeftSection = document.createElement('div');
        clipLeftSection.className = 'pm-lora-entry-left';
        clipLeftSection.appendChild(clipLabel);
        clipLeftSection.appendChild(clipName);

        clipEntry.appendChild(clipLeftSection);
        clipEntry.appendChild(clipStrengthControl);
        container.appendChild(clipEntry);

        totalVisibleEntries++;
      }
    });

    const calculatedHeight = CONTAINER_PADDING * 2 + HEADER_HEIGHT + (totalVisibleEntries * LORA_ENTRY_HEIGHT);
    updateWidgetHeight(container, calculatedHeight, defaultHeight, node);

    container.querySelectorAll('.pm-lora-entry').forEach(entry => {
      const entryLoraName = entry.dataset.loraName;
      updateEntrySelection(entry, entryLoraName === selectedLora);
    });

    const selectionExists = selectedLora
      ? currentLorasData.some((lora) => lora.name === selectedLora)
      : false;

    if (selectedLora && !selectionExists) {
      selectLora(null);
    } else if (selectedLora) {
      emitSelectionChange(buildSelectionPayload(selectedLora));
    }

    // After rendering, check if mouse is over any entry and trigger preview
    requestAnimationFrame(() => {
      const entries = container.querySelectorAll('.pm-lora-entry');
      entries.forEach(entry => {
        const rect = entry.getBoundingClientRect();
        // Check if mouse is currently over this entry
        if (window.lastMouseX >= rect.left && window.lastMouseX <= rect.right &&
            window.lastMouseY >= rect.top && window.lastMouseY <= rect.bottom) {
          // Trigger mouseenter event on the entry
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
      const uniqueValue = (v || []).reduce((acc, lora) => {
        const filtered = acc.filter(u => u.name !== lora.name);
        return [...filtered, lora];
      }, []);

      const updatedValue = uniqueValue.map(lora => ({
        ...lora,
        expanded: lora.hasOwnProperty('expanded') ? lora.expanded : false,
        locked: lora.hasOwnProperty('locked') ? lora.locked : false,
        strength: lora.hasOwnProperty('strength') ? lora.strength : 1.0,
        clipStrength: lora.hasOwnProperty('clipStrength') ? lora.clipStrength : 1.0
      }));

      widgetValue = updatedValue;
      renderLoras(widgetValue, widget);
    },
    hideOnZoom: true,
    selectOn: ['click', 'focus']
  });

  widget.value = defaultValue;
  widget.callback = callback;

  // Listen for locale changes and re-render
  const unsubscribeLocaleChange = onLocaleChange(() => {
    renderLoras(widget.value, widget);
  });

  widget.onRemove = () => {
    previewTooltip.cleanup();
    container.remove();
    unsubscribeLocaleChange();
  };

  return { minWidth: 400, minHeight: defaultHeight, widget };
}

function openPMLoraManager(node) {
  for (const ext of app.extensions) {
    if (ext.name === "ComfyUI.PMModelManager") {
      ext.openForLora(node);
      break;
    }
  }
}

async function openLoraDetails(loraName) {
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
                if (itemName === loraName || item.name === loraName) {
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
          console.error('Error finding lora:', error);
        }

        if (foundItem) {
          dialog.showInfoDialog(foundItem);
        } else {
          console.warn('LoRA not found:', loraName);
        }
      }
      break;
    }
  }
}
