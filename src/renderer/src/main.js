document.addEventListener('DOMContentLoaded', () => {
  window.api.onWaUpdated(async () => {
    if (currentView === 'wa') {
      const contacts = await window.api.getWaContacts();
      window.allContactsCache = contacts;
      renderTable('table-body', contacts);
    }
  });
  window.allContactsCache = window.allContactsCache || [];
  const buttons = document.querySelectorAll('.nav-btn');
  const tabs = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const isDropdown = btn.classList.contains('dropdown-toggle');
      const parent = btn.closest('.nav-dropdown');

      if (isDropdown) {
        parent.classList.toggle('open');
      }

      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        buttons.forEach(b => b.classList.remove('active'));
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabId)?.classList.add('active');
      }
    });
  });

  document.querySelectorAll('.sub-nav-btn[data-type]').forEach(subBtn => {
    subBtn.addEventListener('click', async () => {
      // Визуальное переключение кнопок
      document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
      subBtn.classList.add('active');

      const tabs = document.querySelectorAll('.tab-content');
      tabs.forEach(t => t.classList.remove('active'));
      const crmTab = document.getElementById('tab-crm');
      if (crmTab) crmTab.classList.add('active');
      
      const typeNum = parseInt(subBtn.getAttribute('data-type'));
      
      const parserRes = await window.api.getAllContacts({ page: 1, limit: 2000 });
      const waRes = await window.api.getWaContacts();
      
      window.allContactsCache = [...(parserRes.contacts || []), ...waRes];
      
      const filtered = window.allContactsCache.filter(c => {
        try { 
          const tags = JSON.parse(c.type_json || '[]');
          return tags.includes(typeNum); 
        } catch(e) { return false; }
      });

      renderTable('crm-table-body', filtered);
    });
  });
});

document.addEventListener('click', async (e) => {
  const target = e.target;
  if (target.classList.contains('btn-send-mini')) {
    const row = target.closest('tr');
    
    const name = row.cells[0].innerText.split('\n')[0].trim();
    
    const phone = row.cells[1].querySelector('strong')?.innerText.replace(/\D/g, '') || row.cells[1].innerText.replace(/\D/g, '');
    
    const template = document.getElementById('msg-template').value;
    if (!template) return alert('Сначала напиши текст сообщения во вкладке "Настройка сообщения"!');

    const finalMessage = template.replace('{{name}}', name);

    const originalText = target.innerText;
    target.innerText = '...';
    target.disabled = true;
    
    console.log('Отправка на:', phone, 'Текст:', finalMessage);
    
    const result = await window.api.sendMessage({ phone, message: finalMessage });

    target.disabled = false;
    if (result.success) {
      target.innerText = 'OK';
      target.style.background = '#28a745';
      setTimeout(() => { target.innerText = originalText; target.style.background = ''; }, 2000);
    } else {
      target.innerText = 'Err';
      target.style.background = '#dc3545';
      console.error('Ошибка отправки:', result.error);
      alert('Ошибка: ' + result.error);
      setTimeout(() => { target.innerText = originalText; target.style.background = ''; }, 3000);
    }
  }
});

const startBtn = document.querySelector('.btn-start');
startBtn?.addEventListener('click', async () => {
  const rows = document.querySelectorAll('#table-body tr');
  const contacts = Array.from(rows).map(row => ({
    phone: row.cells[0].innerText,
    name: row.cells[1].innerText
  }));

  const template = document.getElementById('msg-template').value;
  const batchSize = parseInt(document.querySelector('input[value="10"]').value);
  const delay = parseInt(document.querySelector('input[value="30"]').value);

  if (!contacts.length) return alert('Таблица пуста!');

  startBtn.innerHTML = 'РАССЫЛКА ИДЕТ...';
  await window.api.startMailing({ contacts, template, batchSize, delayMinutes: delay });
  alert('Рассылка завершена!');
  startBtn.innerHTML = 'ЗАПУСТИТЬ РАССЫЛКУ';
});

window.api.onStatusUpdate((data) => {
  const { phone, status } = data;
  const rows = document.querySelectorAll('#table-body tr');
  rows.forEach(row => {
    const rowPhone = row.cells[0].innerText.replace(/\D/g, '');
    const cleanTargetPhone = phone.replace(/\D/g, '');
    
    if (rowPhone === cleanTargetPhone) {
      const badge = row.querySelector('.badge');
      if (badge) {
        badge.innerText = status;
        badge.style.background = status === 'Sent' ? '#28a745' : '#dc3545';
      }
    }
  });
});

function addTableRow(contact) {
  const tbody = document.getElementById('table-body');
  const row = document.createElement('tr');
  
  const tdPhone = document.createElement('td');
  tdPhone.contentEditable = "true";
  tdPhone.innerText = contact.phone || '';

  const tdName = document.createElement('td');
  tdName.contentEditable = "true";
  tdName.innerText = contact.name || '';

  const tdStatus = document.createElement('td');
  tdStatus.innerHTML = `<span class="badge" style="background: #666;">New</span>`;

  const tdActions = document.createElement('td');
  
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn-send-mini';
  sendBtn.innerText = 'Send';

  const viewBtn = document.createElement('button');
  viewBtn.innerText = 'Подробнее';
  viewBtn.style.marginLeft = '5px';
  viewBtn.onclick = () => {
    document.getElementById('modalName').innerText = contact.name || 'Без названия';
    document.getElementById('modalPhone').innerText = contact.phone || '—';
    document.getElementById('modalAddress').innerText = contact.address || '—';
    
    const modalWebsite = document.getElementById('modalWebsite');
    if (contact.website) {
      modalWebsite.href = contact.website;
      modalWebsite.innerText = contact.website;
      modalWebsite.style.display = 'inline';
    } else {
      modalWebsite.removeAttribute('href');
      modalWebsite.innerText = '—';
      modalWebsite.style.display = 'inline';
      modalWebsite.style.color = 'inherit';
      modalWebsite.style.textDecoration = 'none';
    }

    document.getElementById('modalDescription').innerText = contact.description || 'Описание отсутствует';
    
    document.getElementById('contactModal').showModal();
  };

  tdActions.appendChild(sendBtn);
  tdActions.appendChild(viewBtn);

  row.appendChild(tdPhone);
  row.appendChild(tdName);
  row.appendChild(tdStatus);
  row.appendChild(tdActions);
  
  tbody.appendChild(row);
}

// Глобальное хранилище для фильтрации без лишних запросов к БД
let currentPage = 1;
const itemsPerPage = 20;
let totalPages = 1;
window.allContactsCache = [];

async function loadContacts(page = 1) {
  currentPage = page;
  
  const result = await window.api.getAllContacts({ 
    page: currentPage, 
    limit: itemsPerPage 
  }) || { contacts: [], pages: 1, total: 0 };
  
  allContactsCache = result.contacts;
  totalPages = result.pages || 1;
  
  renderTable('table-body', allContactsCache);
  if (document.getElementById('tab-crm').classList.contains('active')) {
     renderTable('crm-table-body', allContactsCache);
  }
  
  const pageLabel = document.getElementById('page-info');
  if (pageLabel) {
    pageLabel.innerText = `Страница ${currentPage} из ${totalPages} (Всего: ${result.total})`;
  }

  document.getElementById('prev-page').disabled = (currentPage <= 1);
  document.getElementById('next-page').disabled = (currentPage >= totalPages);
}

document.addEventListener('DOMContentLoaded', () => {
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  if (prevBtn) prevBtn.onclick = () => { if (currentPage > 1) loadContacts(currentPage - 1); };
  if (nextBtn) nextBtn.onclick = () => { if (currentPage < totalPages) loadContacts(currentPage + 1); };
});

// АВТОСОХРАНЕНИЕ ПРИ РЕДАКТИРОВАНИИ
document.addEventListener('blur', async (e) => {
  if (e.target.tagName === 'TD' && e.target.hasAttribute('contenteditable')) {
    const row = e.target.closest('tr');
    const contactId = row.querySelector('.btn-view-mini')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (!contactId) return;

    const cellIndex = e.target.cellIndex;
    const field = cellIndex === 0 ? 'name' : (cellIndex === 1 ? 'phone' : null);
    
    if (field) {
      const newValue = e.target.innerText.trim().replace(/^\+/, '');
      await window.api.updateContact({ id: contactId, field, value: newValue });
      console.log(`Saved ${field}: ${newValue}`);
    }
  }
}, true);

// Слушатели для кнопок пагинации
document.querySelector('.pagination button:first-child')?.addEventListener('click', () => {
  if (currentPage > 1) loadContacts(currentPage - 1);
});

document.querySelector('.pagination button:last-child')?.addEventListener('click', () => {
  loadContacts(currentPage + 1);
});

function renderTable(targetId, data) {
  const tbody = document.getElementById(targetId);
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.5; padding:20px;">Нет данных в этой категории</td></tr>';
    return;
  }

  data.forEach(c => {
    const row = createRowElement(c);
    tbody.appendChild(row);
  });
}

window.showDetailedModal = async function(contactId) {
  const contact = window.allContactsCache.find(c => (c.chat_id || String(c.id)) === String(contactId));
  if (!contact) return console.error('Контакт не найден в кэше:', contactId);

  const modal = document.getElementById('contactModal');
  modal.style.width = '900px';
  modal.style.maxWidth = '95vw';
  
  // 1. Рендер каркаса модалки
  modal.querySelector('.modal-body').innerHTML = `
    <div style="display: flex; gap: 20px; height: 600px;">
      <div style="flex: 1; display: flex; flex-direction: column; border-right: 1px solid #333; padding-right: 20px;">
        <div id="chat-container" class="chat-history" style="flex: 1;">Загрузка чата...</div>
        <div style="margin-top: 10px; display: flex; gap: 10px;">
          <input type="text" id="chat-input" placeholder="Введите сообщение..." style="flex: 1; background: #2d2d2d; border: 1px solid #444; color: white; padding: 10px; border-radius: 4px;">
          <button id="chat-send-btn" style="background: #28a745; border: none; color: white; padding: 0 20px; border-radius: 4px; cursor: pointer;">Отправить</button>
        </div>
      </div>
      
      <div style="width: 300px; display: flex; flex-direction: column; gap: 15px; font-size: 0.9rem;">
        <div id="ai-stats-box" style="background: #111; padding: 15px; border-radius: 8px; border: 1px solid #444;">
          <h4 style="color: #4db8ff; margin-bottom: 10px;">AI Аналитика</h4>
          <div id="ai-loading">Анализирую...</div>
          <div id="ai-content" style="display: none;">
            <p><strong>Вероятность ТЗ:</strong> <span id="ai-prob">--</span></p>
            <p><strong>Статус:</strong> <span id="ai-temp">--</span></p>
            <hr style="border: 0; border-top: 1px solid #333; margin: 10px 0;">
            <p style="color: #aaa; font-size: 0.8rem;"><strong>Боли:</strong> <span id="ai-pains"></span></p>
            <p style="color: #4db8ff; font-size: 0.8rem;"><strong>Следующий шаг:</strong> <span id="ai-next"></span></p>
          </div>
        </div>
        
        <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px dashed #4db8ff;">
          <h4 style="color: #f1c40f; margin-bottom: 10px;">Совет AI</h4>
          <p id="ai-suggest" style="font-style: italic; font-size: 0.85rem; margin-bottom: 10px;">Генерация...</p>
          <button id="btn-copy-suggest" style="width: 100%; background: #444; border: none; color: white; padding: 5px; cursor: pointer; border-radius: 4px; font-size: 0.75rem;">Использовать ответ</button>
        </div>
      </div>
    </div>
  `;

  modal.showModal();

  const getMsgText = (m) => {
    const text = m.textMessage || 
                 m.extendedTextMessage?.text || 
                 m.messageData?.textMessageData?.textMessage || 
                 m.messageData?.extendedTextMessageData?.text ||
                 m.caption || 
                 m.messageData?.imageMessageData?.caption ||
                 m.text;
    return text && text !== 'undefined' ? text : (m.typeMessage === 'audioMessage' ? '🎤 Голосовое' : '[Файл/Инфо]');
  };

  const refreshChat = async () => {
    const result = await window.api.getChatHistory({ phone: contact.phone });
    const chatDiv = document.getElementById('chat-container');
    if (!chatDiv) return;

    if (result.success && Array.isArray(result.history)) {
      chatDiv.innerHTML = result.history.reverse().map(msg => `
        <div class="chat-msg ${msg.type === 'outgoing' || msg.fromMe ? 'out' : 'in'}">
          <div class="msg-text">${getMsgText(msg)}</div>
          <div class="msg-date">${new Date(msg.timestamp * 1000).toLocaleTimeString()}</div>
        </div>
      `).join('');
      chatDiv.scrollTop = chatDiv.scrollHeight;
      return result.history.map(m => `${m.type === 'outgoing' ? 'Я' : 'Клиент'}: ${getMsgText(m)}`).join('\n');
    }
    return '';
  };

  // 2. Инициализация чата
  const historyText = await refreshChat();
  
  // Автообновление
  const chatInterval = setInterval(refreshChat, 5000);
  modal.onclose = () => clearInterval(chatInterval);

  // 3. "Отправить"
  const sendBtn = document.getElementById('chat-send-btn');
  const chatInput = document.getElementById('chat-input');

  sendBtn.onclick = async () => {
    const msg = chatInput.value.trim();
    if (!msg) return;

    sendBtn.disabled = true;
    sendBtn.innerText = '...';

    console.log('Отправка из модалки на:', contact.phone, 'Текст:', msg);
    
    const res = await window.api.sendMessage({ phone: contact.phone, message: msg });
    
    if (res.success) {
      chatInput.value = '';
      await refreshChat();
    } else {
      alert('Ошибка отправки: ' + res.error);
    }
    
    sendBtn.disabled = false;
    sendBtn.innerText = 'Отправить';
  };

  // Отправка по Enter
  chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendBtn.click(); };

  // 4. AI Анализ
  if (historyText) {
    window.api.analyzeChat({ history: historyText, name: contact.name }).then(ai => {
      if (!document.getElementById('ai-loading')) return;
      document.getElementById('ai-loading').style.display = 'none';
      document.getElementById('ai-content').style.display = 'block';
      document.getElementById('ai-prob').innerText = ai.prob || '0%';
      document.getElementById('ai-temp').innerText = ai.temp || 'Холодный';
      document.getElementById('ai-pains').innerText = ai.pains || 'Нет данных';
      document.getElementById('ai-next').innerText = ai.next || 'Нет идей';
      document.getElementById('ai-suggest').innerText = ai.suggest ? `"${ai.suggest}"` : 'Нет идей';
      
      document.getElementById('btn-copy-suggest').onclick = () => {
        chatInput.value = ai.suggest;
      };
    });
  }
};

function createRowElement(contact) {
  const tr = document.createElement('tr');
  let types = [];
  try { types = JSON.parse(contact.type_json || '[]'); } catch(e) { types = []; }
  
  // Универсальный ID (для WA используем chat_id, для парсера - id)
  const universalId = contact.chat_id || contact.id;
  const displayPhone = contact.phone ? `+${contact.phone}` : '—';

  const timeTag = contact.ai_time_tag ? `<span style="display:block; font-size: 0.7rem; color: #f1c40f; margin-top: 4px;">🕒 ${contact.ai_time_tag}</span>` : '';
  tr.innerHTML = `
    <td contenteditable="true">
      ${contact.name || 'Без названия'}
      ${timeTag}
    </td>
    <td contenteditable="true">
      <div class="contact-info-min">
        <strong style="color: #4db8ff;">${displayPhone}</strong>
        <small style="opacity: 0.6;">${contact.email || ''}</small>
      </div>
    </td>
    <td>
      <div class="tags-container">
        ${[1,2,3,4,5,6,7,8].map(t => `
          <span class="tag-toggle ${types.includes(t) ? 'active' : ''}" 
                onclick="window.toggleTag('${universalId}', ${t}, this)" 
                data-type="${t}">${t === 8 ? '★' : t}</span>
        `).join('')}
      </div>
    </td>
    <td>
      <button class="btn-send-mini">Send</button>
      <button class="btn-view-mini" style="background: #007acc; border: none; color: white; padding: 5px 15px; border-radius: 4px; cursor: pointer;" onclick="window.showDetailedModal('${universalId}')">Подробнее</button>
      <button class="btn-delete-mini" style="background:none; color:#ff5c5c; border:none; font-size:1.2rem; cursor:pointer; vertical-align:middle; margin-left:5px;" onclick="window.deleteRow('${universalId}', this)">&times;</button>
    </td>
  `;
  return tr;
}

window.deleteRow = async (id, el) => {
  if (confirm('Удалить этот чат из списка?')) {
    el.closest('tr').remove();
    window.allContactsCache = window.allContactsCache.filter(c => (c.chat_id || c.id) !== id);
  }
};

// Фильтрация в CRM
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const type = btn.getAttribute('data-type');
    
    const filtered = type === 'all' 
      ? allContactsCache 
      : allContactsCache.filter(c => JSON.parse(c.type_json || '[]').includes(parseInt(type)));
    
    renderTable('crm-table-body', filtered);
  });
});

let currentView = 'parser';

const btnShowParser = document.getElementById('btn-show-parser');
const btnShowWa = document.getElementById('btn-show-wa');
const btnSyncWa = document.getElementById('btn-sync-wa');

btnShowParser?.addEventListener('click', () => {
  currentView = 'parser';
  btnShowParser.classList.add('active');
  btnShowWa.classList.remove('active');
  
  document.getElementById('table-headers').innerHTML = `
    <th>Компания / Имя</th>
    <th>Контакты</th>
    <th>Категории (1-7)</th>
    <th>Действие</th>
  `;
  
  loadContacts();
});

btnShowWa?.addEventListener('click', async () => {
  currentView = 'wa';
  btnShowWa.classList.add('active');
  btnShowParser.classList.remove('active');
  
  document.getElementById('table-headers').innerHTML = `
    <th>Имя (AI)</th>
    <th>WhatsApp</th>
    <th>Статус CRM</th>
    <th>Действие</th>
  `;

  const contacts = await window.api.getWaContacts();
  window.allContactsCache = contacts;
  renderTable('table-body', contacts);
});

btnSyncWa?.addEventListener('click', async () => {
  if (!confirm('База будет очищена и загружена заново. Начать?')) return;
  
  const originalText = btnSyncWa.innerText;
  btnSyncWa.disabled = true;

  window.api.onSyncProgress((data) => {
    btnSyncWa.innerText = `${data.percent}% - ${data.text}`;
  });

  const res = await window.api.syncWaChats();
  
  if (res.success) {
    alert(`Готово! Найдено активных чатов: ${res.count}`);
    if (currentView === 'wa') {
      const contacts = await window.api.getWaContacts();
      renderTable('table-body', contacts);
    }
  } else {
    alert('Ошибка: ' + res.error);
  }
  
  btnSyncWa.innerText = originalText;
  btnSyncWa.disabled = false;
});

document.getElementById('btn-sort')?.addEventListener('click', async () => {
  if (currentView === 'wa') {
    const btnSort = document.getElementById('btn-sort');
    btnSort.disabled = true;
    const originalText = btnSort.innerText;

    window.api.onSyncProgress((data) => {
      btnSort.innerText = `${data.percent}%`;
    });

    const res = await window.api.analyzeWaChats();
    if (res.success) {
      alert(`Анализ завершен! Обработано: ${res.count}`);
      const contacts = await window.api.getWaContacts();
      renderTable('table-body', contacts);
    }
    btnSort.innerText = originalText;
    btnSort.disabled = false;
  } else {
    window.allContactsCache.sort((a, b) => {
      const aLen = JSON.parse(a.type_json || '[]').length;
      const bLen = JSON.parse(b.type_json || '[]').length;
      return bLen - aLen;
    });
    renderTable('table-body', window.allContactsCache);
  }
});

loadContacts();

const parseBtn = document.querySelector('.btn-primary'); 
const keywordInput = document.getElementById('parser-url'); 

parseBtn?.addEventListener('click', async () => {
  const url = keywordInput.value || 'https://2gis.kz/astana/search/Разработка и продвижение сайтов';
  
  parseBtn.innerText = 'Парсим...';
  parseBtn.disabled = true;

  await window.api.startParsing({ url });

  parseBtn.innerText = 'Начать парсинг';
  parseBtn.disabled = false;
  alert('Парсинг завершен!');
});

window.api.onParserItemFound((data) => {
  addTableRow(data);
});


window.toggleTag = async function(contactId, typeNum, el) {
  if (!contactId) return alert('Ошибка ID');
  
  const contact = allContactsCache.find(c => (c.chat_id || String(c.id)) === String(contactId));
  if (!contact) return;

  let types = JSON.parse(contact.type_json || '[]');
  if (types.includes(typeNum)) {
    types = types.filter(t => t !== typeNum);
    el.classList.remove('active');
  } else {
    types.push(typeNum);
    el.classList.add('active');
  }
  
  contact.type_json = JSON.stringify(types);
  await window.api.updateContact({ id: contactId, type_json: contact.type_json });
};

const importBtn = document.getElementById('btn-import-csv');
importBtn?.addEventListener('click', async () => {
  const result = await window.api.importCsv();
  if (result.success) {
    alert(`Импортировано строк: ${result.count}`);
    await loadContacts();
  } else if (result.error) {
    alert(`Ошибка импорта: ${result.error}`);
  }
});

const aiBtn = document.getElementById('btn-ai-extract');
aiBtn?.addEventListener('click', async () => {
  aiBtn.innerText = 'Думаю...';
  aiBtn.disabled = true;
  
  const result = await window.api.aiExtractPhones();
  
  if (result.success) {
    alert(`AI нашел и обновил номеров: ${result.count}`);
    await loadContacts();
  }
  
  aiBtn.innerText = 'AI Номера';
  aiBtn.disabled = false;
});

document.getElementById('btn-sort')?.addEventListener('click', async () => {
  if (currentView === 'wa') {
    if (confirm('Запустить AI анализ чатов для распределения по категориям?')) {
      document.getElementById('btn-sync-wa').click();
    }
  } else {
    window.allContactsCache.sort((a, b) => {
      const aLen = JSON.parse(a.type_json || '[]').length;
      const bLen = JSON.parse(b.type_json || '[]').length;
      return bLen - aLen;
    });
    renderTable('table-body', window.allContactsCache);
  }
});

// Проверка статуса AI при запуске
window.api.testAI().then(res => {
  const statusEl = document.getElementById('api-status');
  if (statusEl) {
    statusEl.innerText = res.success ? 'Connected' : 'AI Error';
    statusEl.style.color = res.success ? '#28a745' : '#dc3545';
  }
});

const addManualBtn = document.getElementById('btn-add-manual');
const saveManualBtn = document.getElementById('btn-save-manual');
const addModal = document.getElementById('addContactModal');

addManualBtn?.addEventListener('click', () => {
  addModal.showModal();
});

saveManualBtn?.addEventListener('click', async () => {
  const name = document.getElementById('manual-name').value.trim();
  let phone = document.getElementById('manual-phone').value.trim().replace(/\D/g, '');
  
  if (!name || !phone) return alert('Заполни все поля!');
  if (phone.startsWith('8')) phone = '7' + phone.slice(1);
  if (phone.length === 10) phone = '7' + phone;

  const chatId = `${phone}@c.us`;
  
  const res = await window.api.syncWaChats();
  
  await window.api.updateContact({ 
    id: chatId, 
    type_json: '[]', 
    field: 'manual_add',
    name: name,
    phone: phone
  });

  addModal.close();
  document.getElementById('manual-name').value = '';
  document.getElementById('manual-phone').value = '';
  
  alert('Контакт добавлен. Нажми "Синхрон чатов" или дождись обновления.');
});