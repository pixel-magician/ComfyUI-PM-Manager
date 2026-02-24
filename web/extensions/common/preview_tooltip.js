import { fetchWithUser } from "../pm_model.js";

/**
 * Lightweight preview tooltip that displays images for LoRA models.
 */
export class PreviewTooltip {
  constructor(options = {}) {
    this.modelType = options.modelType || "loras";
    this.element = document.createElement("div");
    this.element.className = "pm-preview-tooltip";
    document.body.appendChild(this.element);
    this.hideTimeout = null;
    this.currentModelName = null;

    this.globalClickHandler = () => this.hide();
    document.addEventListener("click", this.globalClickHandler);

    this.globalScrollHandler = () => this.hide();
    document.addEventListener("scroll", this.globalScrollHandler, true);
  }

  async resolvePreviewUrl(modelName) {
    try {
      const response = await fetchWithUser(
        `/pm_model/preview/${encodeURIComponent(modelName)}`
      );
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      if (blob.size === 0) {
        return null;
      }
      return URL.createObjectURL(blob);
    } catch (error) {
      console.warn("Failed to fetch preview:", error);
      return null;
    }
  }

  async show(modelName, x, y) {
    try {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }

      if (
        this.element.style.display === "block" &&
        this.currentModelName === modelName
      ) {
        this.position(x, y);
        return;
      }

      this.currentModelName = modelName;
      const previewUrl = await this.resolvePreviewUrl(modelName);

      if (!previewUrl) {
        return;
      }

      while (this.element.firstChild) {
        this.element.removeChild(this.element.firstChild);
      }

      const mediaContainer = document.createElement("div");
      mediaContainer.className = "pm-preview-tooltip__media-container";

      const img = document.createElement("img");
      img.className = "pm-preview-tooltip__image";

      const nameLabel = document.createElement("div");
      nameLabel.textContent = modelName.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");
      nameLabel.className = "pm-preview-tooltip__label";

      mediaContainer.appendChild(img);
      mediaContainer.appendChild(nameLabel);
      this.element.appendChild(mediaContainer);

      this.element.style.opacity = "0";
      this.element.style.display = "block";

      await new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 1000);
        img.src = previewUrl;
      });

      requestAnimationFrame(() => {
        this.position(x, y);
        this.element.style.transition = "opacity 0.15s ease";
        this.element.style.opacity = "1";
      });
    } catch (error) {
      console.warn("Failed to load preview:", error);
    }
  }

  position(x, y) {
    const rect = this.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x + 10;
    let top = y + 10;

    if (left + rect.width > viewportWidth) {
      left = x - rect.width - 10;
    }

    if (top + rect.height > viewportHeight) {
      top = y - rect.height - 10;
    }

    left = Math.max(10, Math.min(left, viewportWidth - rect.width - 10));
    top = Math.max(10, Math.min(top, viewportHeight - rect.height - 10));

    Object.assign(this.element.style, {
      left: `${left}px`,
      top: `${top}px`,
    });
  }

  hide() {
    if (this.element.style.display === "block") {
      this.element.style.opacity = "0";
      this.hideTimeout = setTimeout(() => {
        this.element.style.display = "none";
        this.currentModelName = null;
        this.hideTimeout = null;
      }, 150);
    }
  }

  cleanup() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    document.removeEventListener("click", this.globalClickHandler);
    document.removeEventListener("scroll", this.globalScrollHandler, true);
    this.element.remove();
  }
}
