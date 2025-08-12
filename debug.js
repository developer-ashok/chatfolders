// Debug helper for ChatGPT Folders Extension
// Run this in browser console to help diagnose issues

function debugChatGPTFolders() {
  console.log('=== ChatGPT Folders Debug Info ===');
  
  // Check if extension is loaded
  const folderControls = document.querySelector('.folder-controls');
  console.log('Extension UI loaded:', !!folderControls);
  
  // Check sidebar structure
  const sidebar = document.querySelector('aside[aria-labelledby]');
  console.log('Sidebar found:', !!sidebar);
  
  const chatsHeader = document.querySelector('aside[aria-labelledby] h2');
  console.log('Chats header found:', !!chatsHeader);
  if (chatsHeader) {
    console.log('Header text:', chatsHeader.textContent);
  }
  
  // Check for chat items
  const chatItems = document.querySelectorAll('a[href^="/c/"]');
  console.log('Chat items found:', chatItems.length);
  
  // Check storage
  chrome.storage.local.get(['chatgptFolders', 'chatgptChatToFolder'], (result) => {
    console.log('Stored folders:', result.chatgptFolders);
    console.log('Chat-to-folder mapping:', result.chatgptChatToFolder);
  });
  
  // Check for folder containers
  const folderContainers = document.querySelectorAll('.folder-container');
  console.log('Folder containers rendered:', folderContainers.length);
  
  // Check for processed chats
  const processedChats = document.querySelectorAll('a[href^="/c/"].processed');
  console.log('Processed chats:', processedChats.length);
  
  console.log('=== End Debug Info ===');
}

// Auto-run debug if in console
if (typeof window !== 'undefined' && window.location.hostname.includes('openai.com') || window.location.hostname.includes('chatgpt.com')) {
  setTimeout(debugChatGPTFolders, 2000);
}

// Make function available globally
window.debugChatGPTFolders = debugChatGPTFolders;