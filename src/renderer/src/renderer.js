function init() {
  window.addEventListener('DOMContentLoaded', () => {
    doAThing()
  })
}

function doAThing() {
  const versions = window.electron.process.versions
  replaceText('.electron-version', `Electron v${versions.electron}`)
  replaceText('.chrome-version', `Chromium v${versions.chrome}`)
  replaceText('.node-version', `Node v${versions.node}`)

  const ipcHandlerBtn = document.getElementById('ipcHandler')
  ipcHandlerBtn?.addEventListener('click', () => {
    window.electron.ipcRenderer.send('ping')
  })
}

function replaceText(selector, text) {
  const element = document.querySelector(selector)
  if (element) {
    element.innerText = text
  }
}

// Функция, которая создает строку таблицы/списка
function renderContact(contact) {
  const tr = document.createElement('tr');
  
  // Колонка 1: Номер
  const tdPhone = document.createElement('td');
  tdPhone.contentEditable = "true";
  tdPhone.innerText = contact.phone || '';

  // Колонка 2: Имя
  const tdName = document.createElement('td');
  tdName.contentEditable = "true";
  tdName.innerText = contact.name || '';

  // Колонка 3: Статус
  const tdStatus = document.createElement('td');
  tdStatus.innerHTML = `<span class="badge">${contact.status || 'pending'}</span>`;

  // Колонка 4: Действия (Кнопки)
  const tdActions = document.createElement('td');
  
  // Кнопка Send (как в вашем HTML)
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn-send-mini';
  sendBtn.innerText = 'Send';

  // Кнопка для просмотра карточки
  const viewBtn = document.createElement('button');
  viewBtn.innerText = 'Подробнее';
  viewBtn.style.marginLeft = '5px'; // Делаем отступ от кнопки Send
  viewBtn.onclick = () => {
    document.getElementById('modalName').innerText = contact.name || 'Без названия';
    document.getElementById('modalPhone').innerText = contact.phone || '—';
    document.getElementById('modalAddress').innerText = contact.address || '—';
    document.getElementById('modalWebsite').innerText = contact.website || '—';
    document.getElementById('modalDescription').innerText = contact.description || 'Описание отсутствует';
    
    document.getElementById('contactModal').showModal();
  };

  tdActions.appendChild(sendBtn);
  tdActions.appendChild(viewBtn);

  // Собираем строку
  tr.appendChild(tdPhone);
  tr.appendChild(tdName);
  tr.appendChild(tdStatus);
  tr.appendChild(tdActions);
  
  return tr;
}


init()
