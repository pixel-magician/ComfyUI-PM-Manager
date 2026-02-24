
let currentContextMenu = null;

export function createContextMenu(classPrefix, x, y, items) {
  if (currentContextMenu) {
    currentContextMenu.remove();
    currentContextMenu = null;
  }

  const menu = document.createElement('div');
  menu.className = `${classPrefix}-context-menu`;
  currentContextMenu = menu;

  items.forEach(item => {
    if (item.separator) {
      const separator = document.createElement('div');
      separator.className = `${classPrefix}-context-menu-separator`;
      menu.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = `${classPrefix}-context-menu-item`;
      if (item.disabled) {
        menuItem.classList.add('disabled');
      }
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.disabled && item.onClick) {
          item.onClick();
        }
        menu.remove();
        currentContextMenu = null;
      });
      menu.appendChild(menuItem);
    }
  });

  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x;
  let top = y;

  if (left + rect.width > viewportWidth) {
    left = x - rect.width;
  }

  if (top + rect.height > viewportHeight) {
    top = y - rect.height;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      currentContextMenu = null;
      document.removeEventListener('click', closeHandler);
      document.removeEventListener('contextmenu', closeHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('contextmenu', closeHandler);
  }, 0);

  return menu;
}

export function createSingleSelectorContextMenu(classPrefix, x, y, options) {
  const {
    canMoveUp,
    canMoveDown,
    onDelete,
    onMoveUp,
    onMoveDown,
    onViewDetails
  } = options;

  const items = [
    {
      label: '查看详情',
      onClick: onViewDetails
    },
    {
      separator: true
    },
    {
      label: '上移',
      disabled: !canMoveUp,
      onClick: onMoveUp
    },
    {
      label: '下移',
      disabled: !canMoveDown,
      onClick: onMoveDown
    },
    {
      separator: true
    },
    {
      label: '删除',
      onClick: onDelete
    }
  ];

  return createContextMenu(classPrefix, x, y, items);
}
