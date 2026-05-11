import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import axios from 'axios'
import fs from 'fs'
import { GREEN_API_CONFIG } from './config.js'
import { GoogleGenerativeAI } from '@google/generative-ai'
const genAI = new GoogleGenerativeAI(GREEN_API_CONFIG.geminiKey)
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import db from './db.js';
import { parse2GIS } from './parser.js';

import { execSync } from 'child_process';
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }); } catch (e) {}
}
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BASE_URL = `${GREEN_API_CONFIG.host}/waInstance${GREEN_API_CONFIG.idInstance}`
const API_TOKEN = GREEN_API_CONFIG.apiTokenInstance

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- ФУНКЦИЯ ПРЯМОЙ ОТПРАВКИ ---
async function rawSendMessage(phone, message) {
  let cleanPhone = String(phone).replace(/\D/g, '')
  if (cleanPhone.startsWith('8')) cleanPhone = '7' + cleanPhone.slice(1)
  if (cleanPhone.length === 10) cleanPhone = '7' + cleanPhone
  
  const formattedPhone = `${cleanPhone}@c.us`
  const finalMessage = String(message || "Тестовое сообщение")

  const url = `${BASE_URL}/sendMessage/${API_TOKEN}`
  
  console.log(`Отправка через Axios на ${formattedPhone}...`)
  
  const response = await axios.post(url, {
    chatId: formattedPhone,
    message: finalMessage
  })
  
  return response.data
}

function saveContact(phone, name) {
  db.prepare("INSERT OR IGNORE INTO contacts (phone, name, status) VALUES (?, ?, ?)")
    .run(phone, name, 'pending');
}

// --- ОБРАБОТЧИКИ IPC ---

ipcMain.handle('send-whatsapp-message', async (_event, { phone, message }) => {
  if (!message || String(message).trim() === '') {
    console.error('[IPC Error] Сообщение пустое');
    return { success: false, error: 'Сообщение не может быть пустым' };
  }

  try {
    const result = await rawSendMessage(phone, message)
    console.log('[API] Успех! ID:', result.idMessage)
    return { success: true, chatId: result.idMessage }
  } catch (error) {
    const errorData = error.response?.data;
    console.error('[API Error] Статус:', error.response?.status);
    console.error('[API Error] Данные:', JSON.stringify(errorData));
    return { success: false, error: errorData?.message || error.message }
  }
})

let isMailing = false

ipcMain.handle('start-mass-mailing', async (_event, payload) => {
  const { contacts, template, batchSize, delayMinutes } = payload;
  
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    
    for (const contact of batch) {
      saveContact(contact.phone, contact.name);

      let finalMessage = template
        .replace(/{{name}}/g, contact.name || 'Клиент')
        .replace(/{{phone}}/g, contact.phone);

      try {
        await rawSendMessage(contact.phone, finalMessage);
        
        db.prepare("UPDATE contacts SET status = 'Sent', last_sent = CURRENT_TIMESTAMP WHERE phone = ?")
          .run(contact.phone);

        _event.sender.send('mail-status-update', { phone: contact.phone, status: 'Sent' });
      } catch (err) {
        _event.sender.send('mail-status-update', { phone: contact.phone, status: 'Error' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (i + batchSize < contacts.length) {
      await new Promise(resolve => setTimeout(resolve, delayMinutes * 60 * 1000));
    }
  }
  return { success: true };
});

ipcMain.handle('get-all-contacts', (_event, payload) => {
  const { page = 1, limit = 15 } = payload || {};
  const offset = (page - 1) * limit;
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;
  return { contacts, total, pages: Math.ceil(total / limit) };
});

ipcMain.handle('import-csv', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (canceled) return { success: false };

  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().includes(';'));
    
    const stmt = db.prepare(`
      INSERT INTO contacts (
        name, full_name, address, office, phone, whatsapp, email, website, 
        instagram, telegram, vk, categories, rating, reviews_count, 
        schedule, description, lat, lng, type_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
    `);

    let count = 0;
    const transaction = db.transaction((rows) => {
      for (const line of rows) {
        const cols = line.split(';').map(c => c.replace(/^["']|["']$/g, '').trim());
        if (cols.length < 5 || cols[0] === 'Название') continue; 

        let phone = (cols[4] || cols[5] || '').split(',')[0].replace(/\D/g, '');
        if (phone.startsWith('8')) phone = '7' + phone.slice(1);

        stmt.run(
          cols[0] || '', cols[1] || '', cols[2] || '', cols[3] || '',
          phone, cols[5] || '', cols[6] || '', cols[7] || '',
          cols[8] || '', cols[9] || '', cols[10] || '', cols[11] || '',
          cols[12] || '', cols[13] || '', cols[14] || '', cols[15] || '',
          cols[16] || '', cols[17] || ''
        );
        count++;
      }
    });

    transaction(lines);
    return { success: true, count };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update-contact-tags', async (_event, payload) => {
  const { id, type_json, field, name, phone } = payload;
  try {

    if (field === 'manual_add') {
      const chatId = `${phone}@c.us`;
      db.prepare(`
        INSERT INTO wa_contacts (chat_id, phone, name, last_time, type_json)
        VALUES (?, ?, ?, ?, '[]')
        ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name
      `).run(chatId, phone, name, Math.floor(Date.now() / 1000));
      
      return { success: true };
    }

    const stmtParser = db.prepare("UPDATE contacts SET type_json = ? WHERE id = ?");
    const stmtWA = db.prepare("UPDATE wa_contacts SET type_json = ? WHERE chat_id = ? OR id = ?");
    stmtParser.run(type_json, id);
    stmtWA.run(type_json, id, id);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-chat-history', async (_event, { phone }) => {
  try {
    const cleanPhone = String(phone).replace(/\D/g, '');
    const url = `${BASE_URL}/getChatHistory/${API_TOKEN}`;
    const response = await axios.post(url, {
      chatId: `${cleanPhone}@c.us`,
      count: 50
    });
    return { success: true, history: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-parsing', async (event, { url }) => {
  console.log('[Parser] Запуск парсера по URL:', url);
  const existingContacts = db.prepare('SELECT phone FROM contacts').all();
  const existingPhones = new Set(existingContacts.map(c => c.phone));

  return await parse2GIS(url, existingPhones, (data) => {
    event.sender.send('parser-item-found', data);
    const stmt = db.prepare("INSERT OR IGNORE INTO contacts (phone, name, address, website, category, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
    stmt.run(data.phone, data.name, data.address || '', data.website || '', data.category || '', data.description || '', 'pending');
  });
});

ipcMain.handle('ai-analyze-chat', async (_event, { history, name }) => {
  const prompt = `Ты — эксперт по продажам. Проанализируй переписку с клиентом "${name}".
  Твоя задача:
  1. Определи вероятность получения ТЗ (0-100%).
  2. Уровень заинтересованности (холодный/теплый/горячий).
  3. "Боли" клиента (что его беспокоит).
  4. Твой совет по следующему шагу.
  5. Сгенерируй ОДНО рекомендованное сообщение для продолжения. Оно должно имитировать стиль автора (Никиты): кратко, профессионально, технически подкованно, без лишней вежливости ("восклицательных знаков", "надеюсь на ответ" и т.д.).
  
  История переписки:
  ${history}
  
  Верни СТРОГО JSON: {"prob": "85%", "temp": "Горячий", "pains": "текст", "next": "текст", "suggest": "текст"}`;

  try {
    const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GREEN_API_CONFIG.geminiKey}`;
    const aiRes = await axios.post(aiUrl, { contents: [{ parts: [{ text: prompt }] }] });
    const text = aiRes.data.candidates[0].content.parts[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Failed to parse AI response" };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('test-ai-connection', async () => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GREEN_API_CONFIG.geminiKey}`;
  try {
    console.log('--- Running Sanity Check ---');
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: "Ответь одним словом: Тест" }] }]
    });
    const result = response.data.candidates[0].content.parts[0].text;
    console.log('AI Response:', result);
    return { success: true, text: result };
  } catch (err) {
    console.error('Test Failed. Status:', err.response?.status);
    console.error('Details:', JSON.stringify(err.response?.data));
    return { success: false, error: err.response?.status };
  }
});

ipcMain.handle('sync-wa-chats', async (event) => {
  try {
    // 1. ПОЛНАЯ ОЧИСТКА СТАРОЙ БАЗЫ
    db.prepare("DELETE FROM wa_contacts").run();
    console.log('[DB] wa_contacts cleared');

    const urlChats = `${BASE_URL}/getChats/${API_TOKEN}`;
    const response = await axios.get(urlChats);
    const allChats = response.data.filter(c => c.id.includes('@c.us') && !c.id.startsWith('0@'));
    
    let activeCount = 0;
    const historyUrl = `${BASE_URL}/getChatHistory/${API_TOKEN}`;

    for (let i = 0; i < allChats.length; i++) {
      const chat = allChats[i];
      
      // Пауза 15 секунд после каждой десятки чатов
      if (i > 0 && i % 10 === 0) {
        console.log(`[Safe Mode] Batch limit. Cooling down 15s...`);
        event.sender.send('sync-progress', { text: `Охлаждение API (15с)...`, percent: Math.round(((i + 1) / allChats.length) * 100) });
        await new Promise(r => setTimeout(r, 15000));
      }

      event.sender.send('sync-progress', { 
        text: `Проверка чата ${i + 1}/${allChats.length}`, 
        percent: Math.round(((i + 1) / allChats.length) * 100) 
      });

      let success = false;
      let retries = 0;

      while (!success && retries < 2) {
        try {
          const historyRes = await axios.post(historyUrl, { chatId: chat.id, count: 1 }, { timeout: 10000 });
          const hasMessages = Array.isArray(historyRes.data) && historyRes.data.length > 0;

          if (hasMessages) {
            const lastMsg = historyRes.data[0];
            const displayName = chat.name || chat.contactName || chat.id.replace('@c.us', '');
            const phone = chat.id.replace('@c.us', '');
            const lastTime = lastMsg.timestamp || Math.floor(Date.now() / 1000);

            db.prepare(`
              INSERT INTO wa_contacts (chat_id, phone, name, last_time) 
              VALUES (?, ?, ?, ?)
            `).run(chat.id, phone, displayName, lastTime);
            
            activeCount++;
          } 
          success = true;
        } catch (e) {
          if (e.response?.status === 429) {
            console.log(`[429] Limit hit. Waiting 20s...`);
            await new Promise(r => setTimeout(r, 20000));
            retries++;
          } else {
            success = true;
          }
        }
      }

      // Базовая задержка между запросами — 1.5 секунды
      await new Promise(r => setTimeout(r, 1500));
    }

    return { success: true, count: activeCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('analyze-wa-chats', async (event) => {
  try {
    const contacts = db.prepare("SELECT chat_id, name FROM wa_contacts").all();
    const batchSize = 10;
    let analyzedCount = 0;

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      const enrichedBatch = [];

      for (const contact of batch) {
        try {
          const historyRes = await axios.post(`${BASE_URL}/getChatHistory/${API_TOKEN}`, { chatId: contact.chat_id, count: 10 });
          const messages = (historyRes.data || [])
            .map(m => {
              const time = new Date(m.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
              return `[${time}] ${m.type === 'outgoing' ? 'Я' : 'Клиент'}: ${m.textMessage || '[Файл]'}`;
            })
            .join('\n');
          enrichedBatch.push({ id: contact.chat_id, name: contact.name, history: messages || 'Нет переписки' });
        } catch (e) { enrichedBatch.push({ id: contact.chat_id, name: contact.name, history: 'Ошибка' }); }
      }

      const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      const prompt = `Ты — ассистент Никиты. Анализ чатов. Текущее время в Астане: ${now}.
      Задачи:
      1. Имя компании или клиента.
      2. Категории (массив ID 1-7): 1-Новые, 2-Ожидание, 3-Портфолио, 4-Заинтересованы, 5-Напомнить, 6-Вероятен ТЗ, 7-Дали ТЗ.
      3. Метка времени (tag): проанализируй время и суть переписки. Если клиент просил написать позже или пора напомнить — укажи время (н-р: "в 13:30", "завтра"). Если ты ждешь ответа или пауза уместна — пиши "подождать".
      Верни СТРОГО JSON: [{"id": "chat_id", "name": "Название", "cats": [ID], "tag": "метка"}].
      Данные: ${JSON.stringify(enrichedBatch)}`;

      const aiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GREEN_API_CONFIG.geminiKey}`, {
        contents: [{ parts: [{ text: prompt }] }]
      });

      const text = aiRes.data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        const updateStmt = db.prepare("UPDATE wa_contacts SET name = ?, type_json = ?, ai_time_tag = ? WHERE chat_id = ?");
        db.transaction(() => {
          for (const res of results) {
            updateStmt.run(res.name, JSON.stringify(res.cats || []), res.tag || '', res.id);
            analyzedCount++;
          }
        })();
      }
      
      event.sender.send('sync-progress', { text: `Анализ чатов: ${i + batch.length}/${contacts.length}`, percent: Math.round(((i + batch.length) / contacts.length) * 100) });
      await new Promise(r => setTimeout(r, 2000));
    }
    return { success: true, count: analyzedCount };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('clear-wa-contacts', async () => {
  try {
    db.prepare("DELETE FROM wa_contacts").run();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-wa-contacts', () => {
  return db.prepare("SELECT * FROM wa_contacts ORDER BY last_time DESC").all();
});

ipcMain.handle('ai-extract-phones', async () => {
  const contacts = db.prepare(`
    SELECT id, name, address, website, instagram, telegram, description, categories 
    FROM contacts 
    WHERE (phone IS NULL OR phone = '')
  `).all();

  if (contacts.length === 0) return { success: true, count: 0 };

  let updatedCount = 0;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GREEN_API_CONFIG.geminiKey}`;

  console.log(`[AI] Starting search for ${contacts.length} companies...`);

  for (let i = 0; i < contacts.length; i += 5) {
    const batch = contacts.slice(i, i + 5).map(c => ({
      id: c.id,
      name: c.name,
      address: c.address,
      web: c.website,
      ig: c.instagram,
      tg: c.telegram,
      cat: c.categories,
      info: c.description
    }));

    const prompt = `Task: Find WhatsApp/Phone numbers for these Kazakhstan companies. 
    Use the provided data (website, social media, name/address) or your internal knowledge.
    Return ONLY a JSON array: [{"id": 1, "p": "7XXXXXXXXXX"}]. If not found, "p": null.
    Data: ${JSON.stringify(batch)}`;

    try {
      const response = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }]
      }, { timeout: 15000 });

      const text = response.data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        const stmt = db.prepare("UPDATE contacts SET phone = ? WHERE id = ?");
        
        db.transaction((items) => {
          for (const item of items) {
            const company = batch.find(b => b.id === item.id);
            const companyName = company ? company.name : `ID: ${item.id}`;

            if (item.p && String(item.p).length >= 10) {
              const cleanPhone = String(item.p).replace(/\D/g, '');
              stmt.run(cleanPhone, item.id);
              updatedCount++;
              console.log(`\x1b[32m[AI] + Нашел:\x1b[0m ${companyName} -> ${cleanPhone}`);
            } else {
              console.log(`\x1b[31m[AI] - Не нашел:\x1b[0m ${companyName}`);
            }
          }
        })(results);
      }

      console.log(`--- Пачка обработана. Всего обновлено: ${updatedCount} ---`);
      
      // Пауза 10 секунд, чтобы не превысить лимит нового аккаунта
      await new Promise(r => setTimeout(r, 10000));

    } catch (err) {
      if (err.response?.status === 429) {
        console.error(`[AI] Limit hit. Waiting 45s...`);
        await new Promise(r => setTimeout(r, 45000));
        i -= 5;
        continue;
      } else {
        console.error(`[AI] Error:`, err.message);
      }
    }
  }
  return { success: true, count: updatedCount };
});

async function startNotificationListener() {
  const urlReceive = `${BASE_URL}/receiveNotification/${API_TOKEN}`;
  const urlDelete = `${BASE_URL}/deleteNotification/${API_TOKEN}`;

  console.log('[API] Слушатель уведомлений запущен...');

  while (true) {
    try {
      const res = await axios.get(urlReceive, { timeout: 30000 });
      
      if (res.data && res.data.receiptId) {
        const { receiptId, body } = res.data;
        
        console.log(`[Webhook] Тип: ${body.typeWebhook} | От: ${body.senderData?.senderName || 'API'}`);

        const chatId = body.chatId || 
                       body.senderData?.chatId || 
                       body.messageData?.chatId || 
                       body.instanceData?.chatId;
        
        if (chatId && chatId.includes('@c.us')) {
          const phone = chatId.replace('@c.us', '');
          
          const name = body.senderData?.senderName || 
                       body.senderData?.chatName || 
                       phone;
                       
          const timestamp = body.timestamp || Math.floor(Date.now() / 1000);

          console.log(`[DB] Регистрация чата: ${name} (${chatId})`);

          db.prepare(`
            INSERT INTO wa_contacts (chat_id, phone, name, last_time, type_json)
            VALUES (?, ?, ?, ?, '[]')
            ON CONFLICT(chat_id) DO UPDATE SET 
              last_time = excluded.last_time,
              name = CASE 
                WHEN (wa_contacts.name = wa_contacts.phone OR wa_contacts.name IS NULL) 
                THEN excluded.name 
                ELSE wa_contacts.name 
              END
          `).run(chatId, phone, name, timestamp);
          
          BrowserWindow.getAllWindows().forEach(w => w.webContents.send('wa-contacts-updated'));
        }

        await axios.delete(`${urlDelete}/${receiptId}`);
      } else {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error('[API Error] ', e.message);
      }
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}