const PARAMS = [
  { name: "Название ЖК", key: "object", required: false, warningIfMissing: true },
  { name: "Корпус", key: "building", required: false, warningIfMissing: true },
  { name: "Секция", key: "section", required: false },
  { name: "Этаж", key: "floor", required: false },
  { name: "Номер квартиры", key: "flat", required: true },
  { name: "Площадь", key: "area", required: true },
  { name: "Статус", key: "status", required: false, warningIfMissing: true },
  { name: "Цена", key: "price", required: true }, // для поиска всех цен
  { name: "Цена 100%", key: "priceFull", required: false }, // только для отображения
  { name: "Цена базовая", key: "priceBase", required: false }, // только для отображения
  { name: "Отделка", key: "renovation", required: false },
  { name: "Виды", key: "view", required: false },
  { name: "Акции", key: "discount", required: false }
];

function switchTab(tab) {
  document.getElementById('tab-url').classList.toggle('active', tab === 'url');
  document.getElementById('tab-text').classList.toggle('active', tab === 'text');
  document.getElementById('content-url').style.display = tab === 'url' ? 'block' : 'none';
  document.getElementById('content-text').style.display = tab === 'text' ? 'block' : 'none';
  document.getElementById('result').innerHTML = '';
}

function getTagCandidates(param) {
  const input = document.getElementById(`custom-${param.key}`);
  const custom = input?.value ? input.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : [];

  const presets = {
    object: ["object", "building-name", "building_name", "complex-housing", "complex", "JKSchema"],
    building: ["building", "corpus", "corpus-name", "building-section", "building_section", "building-name", "building_name", "house"],
    section: ["section", "section-name", "section_name", "building-section", "building_section", "SectionNumber"],
    floor: ["floor","floornumber"],
    flat: ["flat", "apartment", "number", "flat-number","flat_number","ApartmentNumber", "Num", "FlatNumber"],
    area: ["area", "totalarea", "square","SquareTotal"],
    price: ["price", "DiscountPrice", "price-discount", "price_discount", "price_min", "price100", "pricesale", "PriceTotal", "price-base", "base_price", "price_base", "oldprice", "old-price", "old_price", "price-old", "price_old", "priceold"],
    status: ["status", "status-humanized", "status_humanized", "statuscode", "StateBase"],
    discount: ["discount","discounts", "promo", "special-offer", "special_offer"],
    renovation: ["renovation", "decoration", "furnish","facing"],
    view: ["view","ViewFromWindows", "window-view","window_view", "WindowsViewType"]
  };

  return [...(presets[param.key] || []), ...custom];
}

function validateXMLString(xmlStr) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "application/xml");
  const errors = doc.getElementsByTagName("parsererror");

  if (errors.length > 0) {
    return { valid: false, errors: ["Синтаксическая ошибка в XML"], tagInfo: {} };
  }

  const namespace = doc.documentElement.namespaceURI || null;
  const allTags = Array.from(doc.getElementsByTagNameNS(namespace, "*"));
  const tagInfo = {};
  const issues = [];

  const priceTags = [];

  const customPriceFull = document.getElementById("custom-priceFull")?.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) || [];
  const customPriceBase = document.getElementById("custom-priceBase")?.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) || [];

PARAMS.forEach(param => {
    if (param.key !== "priceFull" && param.key !== "priceBase") {
      const candidates = getTagCandidates(param);
      const tagValuesMap = new Map();

      allTags.forEach(el => {
        const tagName = el.localName?.toLowerCase();
        if (!tagName) return;

        const rawText = el.textContent?.trim() || "";
        
        // Проверяем, есть ли непосредственный тег name внутри (без учета вложенных структур)
        const hasDirectName = Array.from(el.children).some(
          child => child.localName?.toLowerCase() === 'name' && !['jkschema', 'house', 'building'].includes(el.localName?.toLowerCase())
        );
        
        // Для object требуем наличие непосредственного name, а не вложенного через JKSchema
        if (tagName === 'object' && !hasDirectName) return;

        const hasNestedTag = Array.from(el.children).some(
          child => ['name', 'value', 'title'].includes(child.localName?.toLowerCase())
        );
        const hasDirectText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== "");

        if (!hasDirectText && !hasNestedTag) return;

        const matches = candidates.some(c => tagName === c.toLowerCase());
        
        if (matches) {
          let actualTag = tagName;
          let val = rawText.replace(",", ".");

          // Обработка вложенных структур (JKSchema, Building) с Name
          if (['jkschema', 'building', 'house'].includes(tagName)) {
            const nameEl = Array.from(el.children).find(
              child => child.localName?.toLowerCase() === 'name'
            );
            if (nameEl) {
              val = nameEl.textContent?.trim().replace(",", ".") || "";
            }
          }

          if (val && actualTag) {
            if (!tagValuesMap.has(actualTag)) tagValuesMap.set(actualTag, []);
            tagValuesMap.get(actualTag).push(val);
          }
        }

        // Обработка custom-field
        if (tagName === "custom-field") {
          const nameElement = Array.from(el.children).find(
            child => child.localName?.toLowerCase() === 'name'
          );
          const valueElement = Array.from(el.children).find(
            child => child.localName?.toLowerCase() === 'value'
          );
          
          if (!nameElement || !valueElement) return;

          const fieldName = nameElement.textContent.trim().toLowerCase();
          const rawVal = valueElement.textContent?.trim();
          if (!rawVal) return;

          const val = rawVal.replace(",", ".");
          const matchesCustomField = candidates.some(c => fieldName.includes(c.toLowerCase()));
          if (matchesCustomField) {
            const actualTag = `custom-field:${fieldName}`;
            if (!tagValuesMap.has(actualTag)) tagValuesMap.set(actualTag, []);
            tagValuesMap.get(actualTag).push(val);
          }
        }
      });

      const filteredTags = [];
      tagValuesMap.forEach((values, tag) => {
        const normalized = values.map(v => v.trim().replace(",", "."));
        const numericValues = normalized.map(v => parseFloat(v)).filter(v => !isNaN(v));
        const allBinary = numericValues.length > 0 && numericValues.every(v => v === 0 || v === 1);
        const isFlat = param.key === "flat";
        const flatInvalids = normalized.every(v => ["true", "false", ""].includes(v.toLowerCase()));
        const skip = (numericValues.length > 0 && allBinary) || (isFlat && flatInvalids);

        if (!skip && tag) filteredTags.push(`<${tag}>`);
      });

      const clean = [...new Set(filteredTags)].filter(Boolean);
      tagInfo[param.name] = clean;

      if (clean.length === 0) {
        if (param.required) {
          issues.push(`Не найден обязательный параметр: ${param.name}.`);
        } else if (param.warningIfMissing) {
          if (param.key === "status") {
            issues.push("⚠️ Не найден тег для статуса. Он обязателен, если в фиде представлены не только свободные квартиры.");
          }
          if (param.key === "building") {
            issues.push("⚠️ Не найден тег для корпуса. Он обязателен, если в ЖК несколько корпусов с одинаковыми номерами квартир в них.");
          }
        }
      }
    }
  });

  // Обработка цен
  const priceCandidates = getTagCandidates({ key: "price" });

  allTags.forEach(el => {
    const tagName = el.localName?.toLowerCase();
    if (!tagName) return;

    const rawText = el.textContent?.trim();
    if (!rawText) return;

    const valNum = parseFloat(rawText.replace(",", "."));
    if (isNaN(valNum)) return;

    if (priceCandidates.includes(tagName)) {
      priceTags.push({ tag: tagName, value: valNum });
    }
    if (customPriceFull.includes(tagName)) {
      priceTags.push({ tag: tagName, value: valNum, source: "custom-priceFull" });
    }
    if (customPriceBase.includes(tagName)) {
      priceTags.push({ tag: tagName, value: valNum, source: "custom-priceBase" });
    }

    if (tagName === "custom-field") {
      const nameElement = el.querySelector("name");
      const valueElement = el.querySelector("value");
      if (!nameElement || !valueElement) return;

      const fieldName = nameElement.textContent.trim().toLowerCase();
      const rawVal = valueElement.textContent?.trim();
      if (!rawVal) return;

      const val = parseFloat(rawVal.replace(",", "."));
      if (isNaN(val)) return;

      if (priceCandidates.includes(fieldName)) {
        priceTags.push({ tag: `custom-field:${fieldName}`, value: val });
      }
      if (customPriceFull.includes(fieldName)) {
        priceTags.push({ tag: `custom-field:${fieldName}`, value: val, source: "custom-priceFull" });
      }
      if (customPriceBase.includes(fieldName)) {
        priceTags.push({ tag: `custom-field:${fieldName}`, value: val, source: "custom-priceBase" });
      }
    }
  });

// Обновленная обработка цен в функции validateXMLString
if (priceTags.length === 0) {
  issues.push("Не найден обязательный параметр: Цена. Необходимо добавить в фид хотя бы одну цену.");
  tagInfo["Цена 100%"] = [];
  tagInfo["Цена базовая"] = [];
} else {
  const fullPriceTags = priceTags.filter(p => p.source === "custom-priceFull");
  const basePriceTags = priceTags.filter(p => p.source === "custom-priceBase");
  const autoPriceTags = priceTags.filter(p => !p.source);

  // Получаем уникальные теги из autoPriceTags
  const uniqueAutoTags = [];
  const uniqueTagsMap = new Map();
  
  autoPriceTags.forEach(p => {
    if (!uniqueTagsMap.has(p.tag)) {
      uniqueTagsMap.set(p.tag, p);
      uniqueAutoTags.push(p);
    }
  });

  // Обрабатываем ручные теги (пользовательские)
  const manualFullTags = [...new Set(fullPriceTags.map(p => `<${p.tag}>`))];
  const manualBaseTags = [...new Set(basePriceTags.map(p => `<${p.tag}>`))];
  
  // Обрабатываем автоматические теги (найденные в фиде)
  let autoFullTags = [];
  let autoBaseTags = [];
  
  if (uniqueAutoTags.length > 0) {
    if (uniqueAutoTags.length === 1) {
      // Только один уникальный тег цены - помещаем в 100%
      autoFullTags = [`<${uniqueAutoTags[0].tag}>`];
      autoBaseTags = []; // Базовой цены нет
    } else {
      // Несколько уникальных тегов цен - сортируем по убыванию значения
      const sortedPrices = [...uniqueAutoTags].sort((a, b) => {
        // Для сортировки берем первое встретившееся значение каждого тега
        const aValue = autoPriceTags.find(p => p.tag === a.tag)?.value || 0;
        const bValue = autoPriceTags.find(p => p.tag === b.tag)?.value || 0;
        return bValue - aValue;
      });
      
      // Базовой ценой становится тег с наибольшим значением
      autoBaseTags = [`<${sortedPrices[0].tag}>`];
      
      // Все остальные уникальные теги (кроме базового) идут в 100% цену
      autoFullTags = sortedPrices.slice(1)
        .filter(p => p.tag !== sortedPrices[0].tag) // Исключаем базовый тег
        .map(p => `<${p.tag}>`);
    }
  }

  // Комбинируем ручные и автоматические теги
  tagInfo["Цена 100%"] = [...manualFullTags, ...autoFullTags];
  tagInfo["Цена базовая"] = [...manualBaseTags, ...autoBaseTags];

  // Удаляем дубликаты (если пользовательский тег совпал с автоматическим)
  tagInfo["Цена 100%"] = [...new Set(tagInfo["Цена 100%"])].filter(tag => 
    !tagInfo["Цена базовая"].includes(tag) // Исключаем теги, которые уже в базовой цене
  );
  tagInfo["Цена базовая"] = [...new Set(tagInfo["Цена базовая"])];

  // Проверки и предупреждения
  if (uniqueAutoTags.length === 1 && manualBaseTags.length === 0 && manualFullTags.length === 0) {
    issues.push("⚠️ Найдена только одна цена. Если базовая и 100% цена различаются, необходимо добавить в фид обе.");
  }
}

  const infoMessage = issues.length
    ? "Если недостающий тег есть в фиде, но не найден валидатором, то можно добавить его в дополнительные теги перед валидацией и попробовать еще раз."
    : "";

  return {
    valid: issues.filter(e => !e.startsWith("⚠️")).length === 0,
    errors: issues,
    tagInfo,
    infoMessage
  };
}




function renderTagTable(tagInfo) {
  
  const tbody = document.querySelector("#tag-table tbody");
  tbody.innerHTML = "";

  PARAMS.forEach(param => {
    // Пропускаем параметр "Цена", так как он используется только для поиска
    if (param.key === "price") return;
    
    const tags = (tagInfo[param.name] || []).filter(tag => tag && tag.trim());
    
    const tr = document.createElement("tr");
    tr.className = tags.length ? "found" : "not-found";

    const td1 = document.createElement("td");
    td1.textContent = param.name;

    const td2 = document.createElement("td");
    if (tags.length) {
      const uniqueTags = [...new Set(tags)].map(tag => 
        tag.startsWith("custom-field:") 
          ? tag.replace("custom-field:", "") 
          : tag.replace(/[<>]/g, '')
      );
      td2.textContent = uniqueTags.join(", ");
    } else {
      td2.innerHTML = "<i>Не найдено</i>";
    }
    const td3 = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Дополнительный тег";
    input.className = "custom-input";
    input.id = `custom-${param.key}`;
    const existingInput = document.getElementById(`custom-${param.key}`);
    if (existingInput && existingInput.value) {
      input.value = existingInput.value;
    }
    td3.appendChild(input);

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tbody.appendChild(tr);
  });
}

function displayResult(result) {
  const resultDiv = document.getElementById("result");
  const errors = result.errors.filter(e => !e.startsWith("⚠️"));
  const warnings = result.errors.filter(e => e.startsWith("⚠️"));

  let html = "";
  // Ошибки
  if (errors.length > 0) {
    html += "❌ Ошибки:<ul>" + errors.map(e => `<li>${e}</li>`).join("") + "</ul>";
  }
  // Предупреждения
  if (warnings.length > 0) {
    html += "⚠️ Предупреждения:<ul>" + warnings.map(w => `<li>${w.slice(2)}</li>`).join("") + "</ul>";
  }
  // Информационное сообщение (если есть ошибки/предупреждения И есть само сообщение)
  if ((errors.length > 0 || warnings.length > 0) && result.infoMessage) {
    html += `<div class="info-message">${result.infoMessage}</div>`;
  }
  // Сообщение об успехе
  if (errors.length === 0 && warnings.length === 0) {
    html += "✅ XML валиден: все обязательные поля присутствуют и корректны";
  }
  resultDiv.innerHTML = html;
  renderTagTable(result.tagInfo);
}

function validateFromText() {
  const xml = document.getElementById("xml-input").value.trim();
  const result = validateXMLString(xml);
  displayResult(result);
}

async function validateFromURL() {
  const url = document.getElementById("url-input").value.trim();
  try {
    const response = await fetch('https://xml-proxy.onrender.com/fetch?url=' + encodeURIComponent(url));
    if (!response.ok) throw new Error("Ошибка загрузки XML");
    const text = await response.text();
    const result = validateXMLString(text);
    displayResult(result);
  } catch (err) {
    document.getElementById("result").innerHTML = "❌ Ошибка: " + err.message;
  }
}

function validateAgain() {
  const xml = document.getElementById("xml-input").value.trim();
  if (!xml) return alert("Сначала вставьте XML");
  const result = validateXMLString(xml);
  displayResult(result);
}

document.addEventListener("DOMContentLoaded", () => {

  // отрисовать пустую таблицу до валидации
  const initialEmptyInfo = Object.fromEntries(PARAMS.map(p => [p.name, []]));
  renderTagTable(initialEmptyInfo);
});
