
const STYLE_ID = "pm-shared-styles";
let stylePromise = null;

function injectStyles(cssText) {
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = cssText;
}

async function loadCssText() {
  const cssUrl = new URL("./pm_styles.css", import.meta.url);
  const response = await fetch(cssUrl);
  if (!response.ok) {
    throw new Error(`Failed to load ${cssUrl}`);
  }
  return await response.text();
}

export function ensurePmStyles() {
  if (!stylePromise) {
    stylePromise = loadCssText()
      .then((cssText) => {
        injectStyles(cssText);
        return true;
      })
      .catch((error) => {
        console.warn("Failed to load PM Manager styles", error);
        stylePromise = null;
        return false;
      });
  }
  return stylePromise;
}

