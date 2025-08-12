class ChatGPTFolders {
  constructor() {
    this.folders = {};
    this.chatToFolder = {};
    this.chatTitles = {}; // Cache chat titles
    this.isInitialized = false;
    this.observer = null;
    
    this.init();
  }

  async init() {
    // Wait for ChatGPT to load
    await this.waitForElement('aside[aria-labelledby] h2');
    
    // Load saved data
    await this.loadData();
    
    // Initialize folder system
    this.setupFolderSystem();
    
    // Watch for new chats being added
    this.observeChanges();
    
    // Start periodic check for unprocessed chats
    this.startPeriodicCheck();
    
    this.isInitialized = true;
  }

  waitForElement(selector) {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver((mutations) => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve(document.querySelector(selector));
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get(['chatgptFolders', 'chatgptChatToFolder', 'chatgptChatTitles']);
      this.folders = result.chatgptFolders || {};
      this.chatToFolder = result.chatgptChatToFolder || {};
      this.chatTitles = result.chatgptChatTitles || {};
    } catch (error) {
      console.log('Failed to load data:', error);
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({
        chatgptFolders: this.folders,
        chatgptChatToFolder: this.chatToFolder,
        chatgptChatTitles: this.chatTitles
      });
    } catch (error) {
      console.log('Failed to save data:', error);
    }
  }

  setupFolderSystem() {
    const sidebar = document.querySelector('aside[aria-labelledby]');
    if (!sidebar) return;

    // Add folder management UI
    this.addFolderManagementUI(sidebar);
    
    // Process existing chats
    this.processExistingChats();
  }

  addFolderManagementUI(sidebar) {
    const header = sidebar.querySelector('h2');
    if (!header || document.querySelector('.folder-controls')) return;

    // Create main folders section container
    const foldersSection = document.createElement('div');
    foldersSection.className = 'folders-section';

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'folder-controls';
    controlsContainer.innerHTML = `
      <button class="create-folder-btn" title="Create New Folder">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a.5.5 0 0 1 .5.5v6H14a.5.5 0 0 1 0 1H8.5v6a.5.5 0 0 1-1 0V8.5H1a.5.5 0 0 1 0-1h6.5V1A.5.5 0 0 1 8 1z"/>
        </svg>
      </button>
    `;

    foldersSection.appendChild(controlsContainer);
    header.parentNode.insertBefore(foldersSection, header.nextSibling);

    // Add event listener for creating folders
    controlsContainer.querySelector('.create-folder-btn').addEventListener('click', () => {
      this.createFolder();
    });
  }

  processExistingChats() {
    const chatItems = document.querySelectorAll('a[href^="/c/"]:not(.folder-item):not(.processed)');
    
    chatItems.forEach(chatItem => {
      const chatId = this.getChatId(chatItem);
      if (chatId) {
        // Cache the chat title
        const titleElement = chatItem.querySelector('span[dir="auto"]');
        if (titleElement) {
          this.chatTitles[chatId] = titleElement.textContent.trim();
        }
      }
      
      this.processChatItem(chatItem);
      this.injectFolderMenuOptions(chatItem);
    });

    // Save the cached titles
    this.saveData();
    this.renderFolders();
  }

  processChatItem(chatItem) {
    if (chatItem.classList.contains('processed')) return;
    
    chatItem.classList.add('processed');
    
    // Add drag functionality only - don't interfere with anything else
    chatItem.draggable = true;
    
    // Add drag functionality with proper event handling
    const handleDragStart = (e) => {
      const chatId = this.getChatId(chatItem);
      if (!chatId) {
        e.preventDefault();
        return;
      }
      
      console.log('Drag start:', chatId);
      
      e.dataTransfer.setData('text/plain', chatId);
      e.dataTransfer.setData('application/chatgpt-chat', 'true');
      e.dataTransfer.effectAllowed = 'move';
      
      // Add visual feedback
      chatItem.classList.add('dragging');
      
      // Store reference to dragged element
      window._draggedChatId = chatId;
      
      // Create a custom drag image
      try {
        const dragImage = chatItem.cloneNode(true);
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        dragImage.style.left = '-1000px';
        dragImage.style.transform = 'rotate(2deg)';
        dragImage.style.opacity = '0.8';
        dragImage.style.pointerEvents = 'none';
        document.body.appendChild(dragImage);
        
        e.dataTransfer.setDragImage(dragImage, e.offsetX || 20, e.offsetY || 20);
        
        // Remove the temporary drag image after a delay
        setTimeout(() => {
          if (dragImage.parentNode) {
            dragImage.remove();
          }
        }, 100);
      } catch (error) {
        console.log('Could not create custom drag image:', error);
      }
    };
    
    const handleDragEnd = () => {
      chatItem.classList.remove('dragging');
      window._draggedChatId = null;
      
      // Clean up any drag-over states
      document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    };
    
    chatItem.addEventListener('dragstart', handleDragStart);
    chatItem.addEventListener('dragend', handleDragEnd);
    
    // Don't add context menu here - let it be handled separately for cloned items
  }

  getChatId(chatItem) {
    const href = chatItem.getAttribute('href');
    return href ? href.split('/c/')[1] : null;
  }

  injectFolderMenuOptions(chatElement) {
    const chatId = this.getChatId(chatElement);
    if (!chatId) return;

    // Find the 3-dots button with more selectors
    const buttonSelectors = [
      'button[data-testid*="options"]',
      'button[aria-label*="options"]',
      '.trailing button',
      '.__menu-item-trailing-btn',
      '[data-trailing-button]',
      'button[aria-haspopup="menu"]'
    ];

    let dotsButton = null;
    for (const selector of buttonSelectors) {
      dotsButton = chatElement.querySelector(selector);
      if (dotsButton) break;
    }

    if (!dotsButton) {
      // Try again later for this chat
      setTimeout(() => {
        this.injectFolderMenuOptions(chatElement);
      }, 1000);
      return;
    }

    // Remove existing listener if any
    if (dotsButton._folderClickAdded) return;
    dotsButton._folderClickAdded = true;

    // Add click listener to inject folder options when menu opens
    dotsButton.addEventListener('click', (e) => {
      // Try multiple times with different delays to catch the menu
      setTimeout(() => this.addFolderOptionsToMenu(chatId), 50);
      setTimeout(() => this.addFolderOptionsToMenu(chatId), 150);
      setTimeout(() => this.addFolderOptionsToMenu(chatId), 300);
    });
  }

  addFolderOptionsToMenu(chatId) {
    // Look for ChatGPT's menu with expanded selectors
    const menuSelectors = [
      '[role="menu"]',
      '[data-headlessui-state="open"]',
      '[data-state="open"]',
      '.dropdown-menu',
      '[class*="menu"][class*="open"]',
      '[class*="dropdown"][class*="open"]',
      '[style*="transform"][style*="opacity"]',
      'div[style*="position: fixed"][style*="z-index"]'
    ];

    let menu = null;
    for (const selector of menuSelectors) {
      const menus = document.querySelectorAll(selector);
      for (const m of menus) {
        // Check if menu is actually visible
        const rect = m.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && 
            window.getComputedStyle(m).visibility !== 'hidden' &&
            window.getComputedStyle(m).display !== 'none') {
          menu = m;
          break;
        }
      }
      if (menu) break;
    }

    if (!menu) {
      // console.log('Could not find visible ChatGPT menu for chat:', chatId);
      return;
    }

    // Check if we already injected folder options
    if (menu.querySelector('.folder-menu-item')) return;

    console.log('Injecting folder options into menu for chat:', chatId);
    const currentFolder = this.chatToFolder[chatId];

    // Find existing menu items to match their styling
    const existingItems = menu.querySelectorAll('[role="menuitem"], [class*="menu"], div');
    let menuItemStyle = '';
    
    if (existingItems.length > 0) {
      const firstItem = existingItems[0];
      const computedStyle = window.getComputedStyle(firstItem);
      menuItemStyle = `
        padding: ${computedStyle.padding};
        font-size: ${computedStyle.fontSize};
        color: ${computedStyle.color};
        font-family: ${computedStyle.fontFamily};
        line-height: ${computedStyle.lineHeight};
      `;
    }

    // Create separator before folder options
    const separator = document.createElement('div');
    separator.className = 'folder-menu-separator';
    separator.style.cssText = `
      height: 1px;
      background-color: rgba(142, 142, 160, 0.2);
      margin: 8px 0;
    `;

    // Add separator
    menu.appendChild(separator);

    // Add folder options directly to menu
    Object.entries(this.folders).forEach(([folderId, folder]) => {
      const isCurrentFolder = folderId === currentFolder;
      const folderOption = this.createMenuItemLikeOption(
        `Move to "${folder.name}"`,
        () => {
          if (!isCurrentFolder) {
            this.moveChatToFolder(chatId, folderId);
          }
          this.closeMenu(menu);
        },
        isCurrentFolder,
        menuItemStyle,
        isCurrentFolder ? '✓' : '📁'
      );

      menu.appendChild(folderOption);
    });

    // Add "Move to Uncategorized" option
    if (currentFolder) {
      const uncategorizedOption = this.createMenuItemLikeOption(
        'Move to Uncategorized',
        () => {
          this.moveChatToFolder(chatId, null);
          this.closeMenu(menu);
        },
        false,
        menuItemStyle,
        '📤'
      );

      menu.appendChild(uncategorizedOption);
    }
  }

  createMenuItemLikeOption(text, onClick, isActive = false, baseStyle = '', icon = '') {
    const option = document.createElement('div');
    option.className = 'folder-menu-item';
    option.setAttribute('role', 'menuitem');
    
    option.style.cssText = `
      ${baseStyle}
      cursor: ${isActive ? 'default' : 'pointer'};
      color: ${isActive ? 'rgba(142, 142, 160, 0.6)' : 'inherit'};
      transition: background-color 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    if (!isActive) {
      option.addEventListener('mouseenter', () => {
        option.style.backgroundColor = 'rgba(142, 142, 160, 0.1)';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.backgroundColor = 'transparent';
      });

      option.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
    }

    // Add icon and text
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.fontSize = '14px';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    
    option.appendChild(iconSpan);
    option.appendChild(textSpan);
    
    return option;
  }

  createMenuOption(text, onClick, isActive = false) {
    const option = document.createElement('div');
    option.style.cssText = `
      padding: 8px 16px;
      cursor: ${isActive ? 'default' : 'pointer'};
      font-size: 14px;
      color: ${isActive ? 'rgba(142, 142, 160, 0.6)' : 'inherit'};
      transition: background-color 0.2s ease;
      border-radius: 4px;
      margin: 0 8px;
    `;

    if (!isActive) {
      option.addEventListener('mouseenter', () => {
        option.style.backgroundColor = 'rgba(142, 142, 160, 0.1)';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.backgroundColor = 'transparent';
      });

      option.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
    }

    option.textContent = text;
    return option;
  }

  closeMenu(menu) {
    // Try to close the menu by clicking outside or pressing escape
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true
    });
    document.dispatchEvent(escapeEvent);
    
    // Backup: try clicking outside
    setTimeout(() => {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 0,
        clientY: 0
      });
      document.body.dispatchEvent(clickEvent);
    }, 50);
  }

  getChatTitle(chatItem) {
    const titleElement = chatItem.querySelector('span[dir="auto"]');
    return titleElement ? titleElement.textContent.trim() : 'Untitled Chat';
  }

  createFolder() {
    const folderName = prompt('Enter folder name:');
    if (!folderName || folderName.trim() === '') return;

    const folderId = Date.now().toString();
    this.folders[folderId] = {
      name: folderName.trim(),
      chats: [],
      isOpen: true
    };

    this.saveData();
    this.renderFolders();
  }

  renderFolders() {
    const sidebar = document.querySelector('aside[aria-labelledby]');
    if (!sidebar) return;

    const foldersSection = document.querySelector('.folders-section');
    if (!foldersSection) return;

    // Remove existing folder elements and uncategorized headers
    document.querySelectorAll('.folder-container, .uncategorized-header').forEach(el => el.remove());
    
    // Show/hide original chats based on folder membership
    const allChatIds = Object.values(this.folders).flatMap(folder => folder.chats);
    
    document.querySelectorAll('a[href^="/c/"]:not([data-virtual-chat])').forEach(chat => {
      const chatId = this.getChatId(chat);
      const isInFolder = allChatIds.includes(chatId);
      
      if (isInFolder) {
        // Hide chats that are in folders
        chat.style.display = 'none';
        chat._hiddenByFolder = true;
      } else {
        // Show chats that are not in folders
        if (chat._hiddenByFolder) {
          chat.style.display = '';
          chat._hiddenByFolder = false;
        }
      }
    });
    
    // Create folders inside the folders section (this will move chats into folders)
    Object.entries(this.folders).forEach(([folderId, folder]) => {
      const folderElement = this.createFolderElement(folderId, folder);
      foldersSection.appendChild(folderElement);
    });

    // Create uncategorized section for chats not in folders
    this.createUncategorizedSection(foldersSection.parentNode);
    
    // Remove transitions after a delay to avoid interfering with normal interactions
    setTimeout(() => {
      document.querySelectorAll('a[href^="/c/"]').forEach(chat => {
        chat.style.transition = '';
      });
    }, 500);
  }

  createFolderElement(folderId, folder) {
    const folderContainer = document.createElement('div');
    folderContainer.className = 'folder-container';
    folderContainer.dataset.folderId = folderId;

    const folderHeader = document.createElement('div');
    folderHeader.className = 'folder-header';
    folderHeader.innerHTML = `
      <button class="folder-toggle ${folder.isOpen ? 'open' : ''}">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M4.5 3L7.5 6L4.5 9"/>
        </svg>
      </button>
      <span class="folder-name">${folder.name}</span>
      <div class="folder-actions">
        <button class="rename-folder" title="Rename Folder">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M11.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1v8h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h1V3h-1a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h9z"/>
          </svg>
        </button>
        <button class="delete-folder" title="Delete Folder">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M5.5 1a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1h3a.5.5 0 0 1 0 1h-.5v8a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3 11.5v-8H2.5a.5.5 0 0 1 0-1h3V1z"/>
          </svg>
        </button>
      </div>
    `;

    const folderContent = document.createElement('div');
    folderContent.className = `folder-content ${folder.isOpen ? 'open' : ''}`;

    // Add drop zone to both folder header and content
    const addDropZone = (element, targetFolderId) => {
      element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Check if we have valid drag data
        const types = e.dataTransfer.types;
        if (types.includes('application/chatgpt-chat')) {
          e.dataTransfer.dropEffect = 'move';
          element.classList.add('drag-over');
        }
      });

      element.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const types = e.dataTransfer.types;
        if (types.includes('application/chatgpt-chat')) {
          element.classList.add('drag-over');
        }
      });

      element.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Check if we're actually leaving the drop zone
        const rect = element.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          element.classList.remove('drag-over');
        }
      });

      element.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        element.classList.remove('drag-over');
        
        const chatId = e.dataTransfer.getData('text/plain');
        const isChatItem = e.dataTransfer.getData('application/chatgpt-chat');
        
        console.log('Drop event:', { chatId, isChatItem, targetFolderId });
        
        if (isChatItem && chatId && targetFolderId) {
          // Don't move if already in the same folder
          if (this.chatToFolder[chatId] !== targetFolderId) {
            this.moveChatToFolder(chatId, targetFolderId);
          }
        }
      });
    };

    // Make both header and content drop zones
    addDropZone(folderHeader, folderId);
    addDropZone(folderContent, folderId);

    // Add event listeners
    folderHeader.querySelector('.folder-toggle').addEventListener('click', () => {
      this.toggleFolder(folderId);
    });

    folderHeader.querySelector('.rename-folder').addEventListener('click', (e) => {
      e.stopPropagation();
      this.renameFolder(folderId);
    });

    folderHeader.querySelector('.delete-folder').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteFolder(folderId);
    });

    // Create virtual chat items for chats in this folder
    folder.chats.forEach(chatId => {
      const originalChat = this.findChatElement(chatId);
      
      // Create a virtual representation of the chat
      const virtualChat = this.createVirtualChatItem(chatId, originalChat);
      if (virtualChat) {
        folderContent.appendChild(virtualChat);
        
        // Hide the original chat
        if (originalChat) {
          originalChat.style.display = 'none';
          originalChat._hiddenByFolder = true;
        }
      }
    });

    folderContainer.appendChild(folderHeader);
    folderContainer.appendChild(folderContent);

    return folderContainer;
  }

  createVirtualChatItem(chatId, originalChat) {
    // Get chat data
    const chatData = this.getChatData(chatId, originalChat);
    if (!chatData) return null;

    // Create virtual chat element
    const virtualChat = document.createElement('a');
    virtualChat.href = `/c/${chatId}`;
    virtualChat.className = originalChat ? originalChat.className : 'group __menu-item hoverable';
    virtualChat.dataset.chatId = chatId;
    virtualChat.dataset.virtualChat = 'true';
    
    // Create the chat structure
    virtualChat.innerHTML = `
      <div class="flex min-w-0 grow items-center gap-2.5">
        <div class="truncate">
          <span dir="auto">${chatData.title}</span>
        </div>
      </div>
      <div class="trailing highlight text-token-text-tertiary">
        <button class="__menu-item-trailing-btn" 
                aria-label="Open conversation options" 
                type="button">
          <div>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon" aria-hidden="true">
              <path d="M15.498 8.50159C16.3254 8.50159 16.9959 9.17228 16.9961 9.99963C16.9961 10.8271 16.3256 11.4987 15.498 11.4987C14.6705 11.4987 14 10.8271 14 9.99963C14.0002 9.17228 14.6706 8.50159 15.498 8.50159Z"></path>
              <path d="M4.49805 8.50159C5.32544 8.50159 5.99689 9.17228 5.99707 9.99963C5.99707 10.8271 5.32555 11.4987 4.49805 11.4987C3.67069 11.4985 3 10.827 3 9.99963C3.00018 9.17239 3.6708 8.50176 4.49805 8.50159Z"></path>
              <path d="M10.0003 8.50159C10.8276 8.50176 11.4982 9.17239 11.4984 9.99963C11.4984 10.827 10.8277 11.4985 10.0003 11.4987C9.17283 11.4987 8.50131 10.8271 8.50131 9.99963C8.50149 9.17228 9.17294 8.50159 10.0003 8.50159Z"></path>
            </svg>
          </div>
        </button>
      </div>
    `;

    // Add drag functionality
    this.processChatItem(virtualChat);

    // Add click handlers
    this.addVirtualChatHandlers(virtualChat, chatId);

    return virtualChat;
  }

  getChatData(chatId, originalChat) {
    // Try to get cached title first
    let title = this.chatTitles[chatId];
    
    // If no cached title, try to get from original chat
    if (!title && originalChat) {
      const titleElement = originalChat.querySelector('span[dir="auto"]');
      title = titleElement ? titleElement.textContent.trim() : null;
      
      // Cache it for future use
      if (title) {
        this.chatTitles[chatId] = title;
        this.saveData();
      }
    }

    // Fallback to chat ID substring
    if (!title) {
      title = `Chat ${chatId.substring(0, 8)}...`;
    }

    return {
      title: title,
      href: `/c/${chatId}`
    };
  }

  addVirtualChatHandlers(virtualChat, chatId) {
    // Add click handler for navigation
    virtualChat.addEventListener('click', (e) => {
      // Don't navigate if clicking on the 3-dots button
      if (e.target.closest('button')) return;
      
      // Navigate to chat
      window.location.href = virtualChat.href;
    });

    // Add 3-dots menu functionality
    const dotsButton = virtualChat.querySelector('button');
    if (dotsButton) {
      dotsButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showVirtualChatMenu(e, chatId);
      });
    }

    // Add context menu
    virtualChat.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showVirtualChatMenu(e, chatId);
    });
  }

  showVirtualChatMenu(event, chatId) {
    // Remove existing context menus
    document.querySelectorAll('.chat-context-menu').forEach(menu => menu.remove());

    const contextMenu = document.createElement('div');
    contextMenu.className = 'chat-context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = event.clientX + 'px';
    contextMenu.style.top = event.clientY + 'px';

    const currentFolder = this.chatToFolder[chatId];
    const chatData = this.getChatData(chatId);

    let menuHTML = `
      <div class="context-menu-item" data-action="open">📂 Open Chat</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item" data-action="move-to-uncategorized">📤 Move to Uncategorized</div>
    `;
    
    Object.entries(this.folders).forEach(([folderId, folder]) => {
      const isCurrentFolder = folderId === currentFolder;
      if (!isCurrentFolder) {
        menuHTML += `<div class="context-menu-item" data-folder-id="${folderId}">
          📁 Move to "${folder.name}"
        </div>`;
      }
    });

    contextMenu.innerHTML = menuHTML;

    // Add event listeners
    contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;

      const action = item.dataset.action;
      const folderId = item.dataset.folderId;

      if (action === 'open') {
        window.location.href = `/c/${chatId}`;
      } else if (action === 'move-to-uncategorized') {
        this.moveChatToFolder(chatId, null);
      } else if (folderId) {
        this.moveChatToFolder(chatId, folderId);
      }

      contextMenu.remove();
    });

    document.body.appendChild(contextMenu);

    // Close context menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', function closeContextMenu() {
        contextMenu.remove();
        document.removeEventListener('click', closeContextMenu);
      });
    }, 0);
  }

  createUncategorizedSection(container) {
    // Remove existing uncategorized header to prevent duplicates
    const existingHeader = container.querySelector('.uncategorized-header');
    if (existingHeader) {
      existingHeader.remove();
    }

    const uncategorizedChats = document.querySelectorAll('a[href^="/c/"]:not([style*="display: none"])');
    
    if (uncategorizedChats.length > 0) {
      const uncategorizedHeader = document.createElement('div');
      uncategorizedHeader.className = 'uncategorized-header';
      uncategorizedHeader.innerHTML = '<span>Uncategorized</span>';
      
      // Add drop zone to uncategorized section
      this.addUncategorizedDropZone(uncategorizedHeader);
      
      container.appendChild(uncategorizedHeader);
    }
  }

  addUncategorizedDropZone(element) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const types = e.dataTransfer.types;
      if (types.includes('application/chatgpt-chat')) {
        e.dataTransfer.dropEffect = 'move';
        element.classList.add('drag-over');
      }
    });

    element.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const types = e.dataTransfer.types;
      if (types.includes('application/chatgpt-chat')) {
        element.classList.add('drag-over');
      }
    });

    element.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const rect = element.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        element.classList.remove('drag-over');
      }
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');
      
      const chatId = e.dataTransfer.getData('text/plain');
      const isChatItem = e.dataTransfer.getData('application/chatgpt-chat');
      
      console.log('Drop on uncategorized:', { chatId, isChatItem });
      
      if (isChatItem && chatId) {
        // Move to uncategorized (remove from folder)
        this.moveChatToFolder(chatId, null);
      }
    });
  }

  findChatElement(chatId) {
    return document.querySelector(`a[href="/c/${chatId}"]`);
  }

  moveChatToFolder(chatId, folderId) {
    // Remove from previous folder
    Object.entries(this.folders).forEach(([id, folder]) => {
      const index = folder.chats.indexOf(chatId);
      if (index > -1) {
        folder.chats.splice(index, 1);
      }
    });

    // Add to new folder or uncategorized
    if (folderId && this.folders[folderId]) {
      this.folders[folderId].chats.push(chatId);
      this.chatToFolder[chatId] = folderId;
    } else {
      delete this.chatToFolder[chatId];
    }

    this.saveData();
    
    // Always do a minimal re-render to ensure consistency
    setTimeout(() => {
      this.renderFolders();
      // Refresh menu injections for all chats after folder change
      this.refreshMenuInjections();
    }, 50);
  }

  moveChatElementDirectly(chatElement, chatId, targetFolderId) {
    // Find target location
    let targetContainer;
    
    if (targetFolderId && this.folders[targetFolderId]) {
      // Moving to a folder
      const folderContainer = document.querySelector(`[data-folder-id="${targetFolderId}"]`);
      if (folderContainer) {
        targetContainer = folderContainer.querySelector('.folder-content');
      }
    } else {
      // Moving to uncategorized - restore to original parent
      if (chatElement._originalParent) {
        targetContainer = chatElement._originalParent;
      }
    }

    if (targetContainer && chatElement.parentNode !== targetContainer) {
      // Add smooth transition
      chatElement.style.transition = 'all 0.3s ease';
      
      // Move the element
      if (targetFolderId) {
        // Moving to folder
        targetContainer.appendChild(chatElement);
      } else {
        // Moving to uncategorized - try to restore original position
        if (chatElement._originalNextSibling && 
            chatElement._originalNextSibling.parentNode === targetContainer) {
          targetContainer.insertBefore(chatElement, chatElement._originalNextSibling);
        } else {
          targetContainer.appendChild(chatElement);
        }
      }

      // Remove transition after animation
      setTimeout(() => {
        chatElement.style.transition = '';
      }, 300);

      // Update folder toggle states if needed
      this.updateFolderToggleStates();
    }
  }

  updateFolderToggleStates() {
    // Update folder open/close states and chat counts without full re-render
    Object.entries(this.folders).forEach(([folderId, folder]) => {
      const folderContainer = document.querySelector(`[data-folder-id="${folderId}"]`);
      if (folderContainer) {
        const folderContent = folderContainer.querySelector('.folder-content');
        const toggle = folderContainer.querySelector('.folder-toggle');
        
        // Update visibility based on folder state
        if (folder.isOpen) {
          toggle.classList.add('open');
          folderContent.classList.add('open');
        } else {
          toggle.classList.remove('open');
          folderContent.classList.remove('open');
        }
      }
    });
  }

  toggleFolder(folderId) {
    if (this.folders[folderId]) {
      this.folders[folderId].isOpen = !this.folders[folderId].isOpen;
      
      // Update UI immediately without full re-render
      const folderContainer = document.querySelector(`[data-folder-id="${folderId}"]`);
      if (folderContainer) {
        const toggle = folderContainer.querySelector('.folder-toggle');
        const content = folderContainer.querySelector('.folder-content');
        
        if (this.folders[folderId].isOpen) {
          toggle.classList.add('open');
          content.classList.add('open');
        } else {
          toggle.classList.remove('open');
          content.classList.remove('open');
        }
      }
      
      this.saveData();
    }
  }

  renameFolder(folderId) {
    const folder = this.folders[folderId];
    if (!folder) return;

    const newName = prompt('Enter new folder name:', folder.name);
    if (newName && newName.trim() !== '' && newName.trim() !== folder.name) {
      folder.name = newName.trim();
      this.saveData();
      this.renderFolders();
    }
  }

  deleteFolder(folderId) {
    const folder = this.folders[folderId];
    if (!folder) return;

    if (confirm(`Delete folder "${folder.name}"? Chats will be moved to uncategorized.`)) {
      // Remove chat associations
      folder.chats.forEach(chatId => {
        delete this.chatToFolder[chatId];
      });

      delete this.folders[folderId];
      this.saveData();
      this.renderFolders();
    }
  }

  showChatContextMenu(event, chatItem) {
    // Remove existing context menus
    document.querySelectorAll('.chat-context-menu').forEach(menu => menu.remove());

    const contextMenu = document.createElement('div');
    contextMenu.className = 'chat-context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = event.clientX + 'px';
    contextMenu.style.top = event.clientY + 'px';

    const chatId = this.getChatId(chatItem);
    const currentFolder = this.chatToFolder[chatId];
    const chatTitle = this.getChatTitle(chatItem);

    let menuHTML = `
      <div class="context-menu-item" data-action="rename">✏️ Rename</div>
      <div class="context-menu-item" data-action="delete">🗑️ Delete</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item" data-action="move-to-uncategorized">📤 Move to Uncategorized</div>
    `;
    
    Object.entries(this.folders).forEach(([folderId, folder]) => {
      const isCurrentFolder = folderId === currentFolder;
      menuHTML += `<div class="context-menu-item ${isCurrentFolder ? 'disabled' : ''}" data-folder-id="${folderId}">
        ${isCurrentFolder ? '✓ ' : '📁 '}Move to "${folder.name}"
      </div>`;
    });

    contextMenu.innerHTML = menuHTML;

    // Add event listeners
    contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item || item.classList.contains('disabled')) return;

      const action = item.dataset.action;
      const folderId = item.dataset.folderId;

      if (action === 'rename') {
        const newName = prompt('Rename conversation:', chatTitle);
        if (newName && newName.trim() !== chatTitle) {
          // Try to trigger ChatGPT's rename functionality
          this.renameChatViaOriginal(chatItem, newName);
        }
      } else if (action === 'delete') {
        if (confirm(`Delete "${chatTitle}"?`)) {
          this.deleteChatViaOriginal(chatItem);
        }
      } else if (action === 'move-to-uncategorized') {
        this.moveChatToFolder(chatId, null);
      } else if (folderId) {
        this.moveChatToFolder(chatId, folderId);
      }

      contextMenu.remove();
    });

    document.body.appendChild(contextMenu);

    // Close context menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', function closeContextMenu() {
        contextMenu.remove();
        document.removeEventListener('click', closeContextMenu);
      });
    }, 0);
  }

  renameChatViaOriginal(chatItem, newName) {
    // Try to find and trigger the original chat's rename function
    const chatId = this.getChatId(chatItem);
    const originalChat = this.findChatElement(chatId);
    
    if (originalChat) {
      // Temporarily show original and try to trigger rename
      const originalDisplay = originalChat.style.display;
      originalChat.style.display = '';
      originalChat.style.position = 'absolute';
      originalChat.style.left = '-9999px';
      
      // Look for rename button and click it
      const originalButton = originalChat.querySelector('button[data-testid*="options"], .trailing button, .__menu-item-trailing-btn');
      if (originalButton) {
        originalButton.click();
        
        // Look for rename option in the menu that appears
        setTimeout(() => {
          const renameOption = document.querySelector('[role="menuitem"]:contains("Rename"), [data-testid*="rename"], button:contains("Rename")');
          if (renameOption) {
            renameOption.click();
          }
          
          // Restore original chat state
          originalChat.style.display = originalDisplay;
          originalChat.style.position = '';
          originalChat.style.left = '';
        }, 100);
      }
    }
  }

  deleteChatViaOriginal(chatItem) {
    // Try to find and trigger the original chat's delete function
    const chatId = this.getChatId(chatItem);
    const originalChat = this.findChatElement(chatId);
    
    if (originalChat) {
      // Remove from our folder tracking
      this.moveChatToFolder(chatId, null);
      
      // Temporarily show original and try to trigger delete
      const originalDisplay = originalChat.style.display;
      originalChat.style.display = '';
      originalChat.style.position = 'absolute';
      originalChat.style.left = '-9999px';
      
      const originalButton = originalChat.querySelector('button[data-testid*="options"], .trailing button, .__menu-item-trailing-btn');
      if (originalButton) {
        originalButton.click();
        
        setTimeout(() => {
          const deleteOption = document.querySelector('[role="menuitem"]:contains("Delete"), [data-testid*="delete"], button:contains("Delete")');
          if (deleteOption) {
            deleteOption.click();
          }
          
          originalChat.style.display = originalDisplay;
          originalChat.style.position = '';
          originalChat.style.left = '';
        }, 100);
      }
    }
  }

  startPeriodicCheck() {
    // Check for unprocessed chats every 2 seconds
    setInterval(() => {
      this.processUnhandledChats();
    }, 2000);
  }

  processUnhandledChats() {
    // Find chats that don't have menu injection
    const unprocessedChats = document.querySelectorAll('a[href^="/c/"]:not(.processed):not([data-virtual-chat])');
    
    if (unprocessedChats.length > 0) {
      console.log(`Found ${unprocessedChats.length} unprocessed chats, adding menu injection`);
      
      unprocessedChats.forEach(chat => {
        const chatId = this.getChatId(chat);
        if (chatId) {
          // Cache the chat title
          const titleElement = chat.querySelector('span[dir="auto"]');
          if (titleElement) {
            this.chatTitles[chatId] = titleElement.textContent.trim();
          }
        }
        
        this.processChatItem(chat);
        this.injectFolderMenuOptions(chat);
      });
      
      // Save cached titles
      this.saveData();
    }
  }

  refreshMenuInjections() {
    // Re-inject menu options for all visible chats
    const allChats = document.querySelectorAll('a[href^="/c/"]:not([data-virtual-chat])');
    
    allChats.forEach(chat => {
      const chatId = this.getChatId(chat);
      if (chatId) {
        // Reset the injection flag to allow re-injection
        const dotsButton = chat.querySelector('button[data-testid*="options"], .trailing button, .__menu-item-trailing-btn');
        if (dotsButton) {
          dotsButton._folderClickAdded = false;
          this.injectFolderMenuOptions(chat);
        }
      }
    });
  }

  observeChanges() {
    const sidebar = document.querySelector('aside[aria-labelledby]');
    if (!sidebar) return;

    let updateTimeout;

    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

              mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for new chat items
              if ((node.matches('a[href^="/c/"]') || node.querySelector('a[href^="/c/"]')) && 
                  !node.classList.contains('folder-container') &&
                  !node.classList.contains('uncategorized-header') &&
                  !node.classList.contains('folder-controls')) {
                shouldUpdate = true;
                
                // Immediately process new chats
                const newChats = node.matches('a[href^="/c/"]') ? [node] : node.querySelectorAll('a[href^="/c/"]');
                newChats.forEach(chat => {
                  if (!chat.classList.contains('processed')) {
                    const chatId = this.getChatId(chat);
                    if (chatId) {
                      // Cache the chat title
                      const titleElement = chat.querySelector('span[dir="auto"]');
                      if (titleElement) {
                        this.chatTitles[chatId] = titleElement.textContent.trim();
                      }
                    }
                    
                    this.processChatItem(chat);
                    this.injectFolderMenuOptions(chat);
                  }
                });
              }
            }
          });
        });

      if (shouldUpdate) {
        // Debounce updates to prevent infinite loops
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          this.processExistingChats();
        }, 300);
      }
    });

    this.observer.observe(sidebar, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize when DOM is ready (but only once)
if (!window.chatGPTFoldersInstance) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.chatGPTFoldersInstance = new ChatGPTFolders();
    });
  } else {
    window.chatGPTFoldersInstance = new ChatGPTFolders();
  }
}