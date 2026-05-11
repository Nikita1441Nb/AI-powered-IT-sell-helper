import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  sendMessage: (data) => ipcRenderer.invoke('send-whatsapp-message', data),
  startMailing: (data) => ipcRenderer.invoke('start-mass-mailing', data),
  onStatusUpdate: (callback) => ipcRenderer.on('mail-status-update', (_event, value) => callback(value)),
  importCsv: () => ipcRenderer.invoke('import-csv'),
  getAllContacts: (args) => ipcRenderer.invoke('get-all-contacts', args),
  
  startParsing: (args) => ipcRenderer.invoke('start-parsing', args),
  onParserItemFound: (callback) => ipcRenderer.on('parser-item-found', (_event, value) => callback(value)),
  onSyncProgress: (callback) => ipcRenderer.on('sync-progress', (_event, value) => callback(value)),
  getChatHistory: (data) => ipcRenderer.invoke('get-chat-history', data),
  updateContact: (data) => ipcRenderer.invoke('update-contact-tags', data),
  aiExtractPhones: () => ipcRenderer.invoke('ai-extract-phones'),
  testAI: () => ipcRenderer.invoke('test-ai-connection'),
  syncWaChats: () => ipcRenderer.invoke('sync-wa-chats'),
  analyzeWaChats: () => ipcRenderer.invoke('analyze-wa-chats'),
  clearWaContacts: () => ipcRenderer.invoke('clear-wa-contacts'),
  analyzeChat: (data) => ipcRenderer.invoke('ai-analyze-chat', data),
  getWaContacts: () => ipcRenderer.invoke('get-wa-contacts'),
  onWaUpdated: (callback) => ipcRenderer.on('wa-contacts-updated', (_event) => callback()),
})