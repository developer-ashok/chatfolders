class ChatGPTFolders {
  constructor() {
    this.folders = {};
    this.chatToFolder = {};
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
      const result = await chrome.storage.local.get(['chatgptFolders', 'chatgptChatToFolder']);
      this.folders = result.chatgptFolders || {};
      this.chatToFolder = result.chatgptChatToFolder || {};
    } catch (error) {
      console.log('Failed to load data:', error);
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({
        chatgptFolders: this.folders,
        chatgptChatToFolder: this.chatToFolder
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

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'folder-controls';
    controlsContainer.innerHTML = `
      <button class="create-folder-btn" title="Create New Folder">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a.5.5 0 0 1 .5.5v6H14a.5.5 0 0 1 0 1H8.5v6a.5.5 0 0 1-1 0V8.5H1a.5.5 0 0 1 0-1h6.5V1A.5.5 0 0 1 8 1z"/>
        </svg>
      </button>
    `;

    header.parentNode.insertBefore(controlsContainer, header.nextSibling);

    // Add event listener for creating folders
    controlsContainer.querySelector('.create-folder-btn').addEventListener('click', () => {
      this.createFolder();
    });
  }

  processExistingChats() {
    const chatItems = document.querySelectorAll('a[href^="/c/"]:not(.folder-item):not(.processed)');
    
    chatItems.forEach(chatItem => {
      this.processChatItem(chatItem);
    });

    this.renderFolders();
  }

  processChatItem(chatItem) {
    if (chatItem.classList.contains('processed')) return;
    
    chatItem.classList.add('processed');
    
    // Add drag functionality
    chatItem.draggable = true;
    chatItem.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', this.getChatId(chatItem));
      e.dataTransfer.setData('application/chatgpt-chat', 'true');
    });

    // Add context menu for folder management
    chatItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showChatContextMenu(e, chatItem);
    });
  }

  getChatId(chatItem) {
    const href = chatItem.getAttribute('href');
    return href ? href.split('/c/')[1] : null;
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

    const chatContainer = sidebar.querySelector('h2').parentNode;
    if (!chatContainer) return;

    // Remove existing folder elements and uncategorized headers
    document.querySelectorAll('.folder-container, .uncategorized-header').forEach(el => el.remove());
    
    // Reset all chat visibility first
    document.querySelectorAll('a[href^="/c/"]').forEach(chat => {
      chat.style.display = '';
    });
    
    // Create folders
    Object.entries(this.folders).forEach(([folderId, folder]) => {
      const folderElement = this.createFolderElement(folderId, folder);
      chatContainer.appendChild(folderElement);
    });

    // Create uncategorized section for chats not in folders
    this.createUncategorizedSection(chatContainer);
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

    // Add drop zone
    folderContent.addEventListener('dragover', (e) => {
      e.preventDefault();
      folderContent.classList.add('drag-over');
    });

    folderContent.addEventListener('dragleave', () => {
      folderContent.classList.remove('drag-over');
    });

    folderContent.addEventListener('drop', (e) => {
      e.preventDefault();
      folderContent.classList.remove('drag-over');
      
      const chatId = e.dataTransfer.getData('text/plain');
      const isChatItem = e.dataTransfer.getData('application/chatgpt-chat');
      
      if (isChatItem && chatId) {
        this.moveChatToFolder(chatId, folderId);
      }
    });

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

    // Add chats to folder
    folder.chats.forEach(chatId => {
      const chatElement = this.findChatElement(chatId);
      if (chatElement) {
        // Clone the chat element and make it functional
        const clonedChat = chatElement.cloneNode(true);
        
        // Ensure the cloned chat maintains its functionality
        this.processChatItem(clonedChat);
        
        // Add to folder content
        folderContent.appendChild(clonedChat);
        
        // Hide original chat
        chatElement.style.display = 'none';
      }
    });

    folderContainer.appendChild(folderHeader);
    folderContainer.appendChild(folderContent);

    return folderContainer;
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
      
      container.appendChild(uncategorizedHeader);
    }
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

    // Show the original chat element first (unhide it)
    const originalChat = this.findChatElement(chatId);
    if (originalChat) {
      originalChat.style.display = '';
    }

    // Add to new folder
    if (folderId && this.folders[folderId]) {
      this.folders[folderId].chats.push(chatId);
      this.chatToFolder[chatId] = folderId;
    } else {
      delete this.chatToFolder[chatId];
    }

    this.saveData();
    
    // Small delay to ensure DOM is updated before re-rendering
    setTimeout(() => {
      this.renderFolders();
    }, 50);
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

    let menuHTML = '<div class="context-menu-item" data-action="move-to-uncategorized">Move to Uncategorized</div>';
    
    Object.entries(this.folders).forEach(([folderId, folder]) => {
      const isCurrentFolder = folderId === currentFolder;
      menuHTML += `<div class="context-menu-item ${isCurrentFolder ? 'disabled' : ''}" data-folder-id="${folderId}">
        ${isCurrentFolder ? '✓ ' : ''}Move to "${folder.name}"
      </div>`;
    });

    contextMenu.innerHTML = menuHTML;

    // Add event listeners
    contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item || item.classList.contains('disabled')) return;

      const folderId = item.dataset.folderId;
      if (item.dataset.action === 'move-to-uncategorized') {
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

  observeChanges() {
    const sidebar = document.querySelector('aside[aria-labelledby]');
    if (!sidebar) return;

    let updateTimeout;

    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Only update for actual chat items, not our own folder elements
            if ((node.matches('a[href^="/c/"]') || node.querySelector('a[href^="/c/"]')) && 
                !node.classList.contains('folder-container') &&
                !node.classList.contains('uncategorized-header') &&
                !node.classList.contains('folder-controls')) {
              shouldUpdate = true;
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