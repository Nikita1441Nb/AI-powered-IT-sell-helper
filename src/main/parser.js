import { chromium } from 'playwright';

export async function parse2GIS(targetUrl, skipPhones = new Set(), onProgress) {
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox'
    ]
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: null
  });
  const page = await context.newPage();

  // ПЕРЕХВАТ API: Ловим JSON ответы от сервера 2GIS
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
      try {
        const json = await response.json();
        const items = json?.result?.items || [];
        
        for (const item of items) {
          const contacts = item.contacts || [];
          const phoneObj = contacts.find(c => c.type === 'phone' || c.type === 'whatsapp');
          const phone = phoneObj ? phoneObj.value.replace(/\D/g, '') : '';

          if (phone && !skipPhones.has(phone)) {
            skipPhones.add(phone);
            if (onProgress) {
              onProgress({
                name: item.name || 'Без названия',
                phone: phone,
                address: item.address_name || item.address?.[0]?.name || '',
                website: contacts.find(c => c.type === 'website')?.value || '',
                category: item.caption || 'Разработка сайтов',
                description: item.purpose || 'Lead from 2GIS API',
                status: 'pending'
              });
            }
          }
        }
      } catch (e) {
      }
    }
  });

  const finalUrl = decodeURIComponent(targetUrl);
  console.log(`[Parser] Переход по ссылке: ${finalUrl}`);

  try {
    await page.goto(finalUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    
    await page.waitForTimeout(5000);
    console.log('[Parser] Окно открыто. Если видите поиск — кликайте по компаниям.');
    console.log('[Parser] РЕЖИМ РУЧНОГО СБОРА: Скролльте список и кликайте по карточкам...');

    while (context.pages().length > 0) {
      await page.waitForTimeout(1000).catch(() => {});
    }
  } catch (e) {
    if (!e.message.includes('has been closed')) {
      console.error('[Parser] Ошибка:', e.message);
    }
  }
}