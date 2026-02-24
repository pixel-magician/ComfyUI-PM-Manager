let currentContextMenu = null;

export function createContextMenu(x, y, items) {
  // Remove existing context menu if any
  if (currentContextMenu) {
    currentContextMenu.remove();
    currentContextMenu = null;
  }

  const menu = document.createElement('div');
  menu.className = 'pm-lora-context-menu';
  currentContextMenu = menu;

  items.forEach(item => {
    if (item.separator) {
      const separator = document.createElement('div');
      separator.className = 'pm-lora-context-menu-separator';
      menu.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'pm-lora-context-menu-item';
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
      });
      menu.appendChild(menuItem);
    }
  });

  document.body.appendChild(menu);

  // Position menu
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

  // Close menu on click outside
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

export function createLoraContextMenu(x, y, options) {
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

  return createContextMenu(x, y, items);
}
