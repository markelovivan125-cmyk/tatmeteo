(function() {
  'use strict';
  var $ = function(id) { return document.getElementById(id); };

  /* Перезапуск одноразовой CSS-анимации: снять класс → reflow → надеть класс */
  function retrig(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  var hiddenPanels = {};
  /* Плавное сворачивание/разворачивание панелей: scale+fade через .panel-hide,
     display:none — только по завершении перехода (transitionend + таймер-страховка) */
  window.closePanel = function(id) {
    var el = $(id);
    if (el) {
      hiddenPanels[id] = true;
      el.classList.add('panel-hide'); /* ящик уезжает за свой край (векторы в CSS) */
      el.setAttribute('aria-hidden', 'true');
      var done = function() {
        el.removeEventListener('transitionend', done);
        if (hiddenPanels[id]) el.style.display = 'none';
        el.classList.remove('panel-hide');
      };
      el.addEventListener('transitionend', done);
      setTimeout(done, 420); /* страховка: чуть больше --dur-slow (320мс) выезда */
    }
    var rb = $('restore-' + id); if (rb) { rb.style.display = 'block'; rb.setAttribute('aria-expanded', 'false'); }
  };
  window.restorePanel = function(id) {
    var el = $(id);
    if (el) {
      var flexPanels = { ctrl: 1, tl: 1 };
      hiddenPanels[id] = false;
      el.classList.add('panel-hide'); /* стартовая позиция — за краем */
      el.style.display = flexPanels[id] ? 'flex' : 'block';
      el.setAttribute('aria-hidden', 'false');
      void el.offsetWidth; /* reflow — фиксируем позицию «за краем», затем плавный въезд */
      el.classList.remove('panel-hide');
    }
    var rb = $('restore-' + id); if (rb) { rb.style.display = 'none'; rb.setAttribute('aria-expanded', 'true'); }
  };

  var SRC = 'https://rainradar.ru/composite', FZ = 5, MDBZ = 5, DELAY = 600, STEP = 600;
  var HISTORY_MINUTES = 190, MAX_HISTORY_SEC = HISTORY_MINUTES * 60;
  var BASE_RES_KM = 2;

  /* ─── Спутник EUMETSAT: сетка времени 15 мин, задержка публикации ~20 мин, история 12 ч ─── */
  var SAT_STEP = 900, SAT_DELAY = 1200, SAT_HISTORY_SEC = 12 * 3600;
  /* БЛОК A: спутник ВСЕГДА полупрозрачный — базовая карта видна сквозь тайлы.
     Вариант №1 (жёстко 50%): слайдер в sat-режиме заблокирован и показывает 50,
     значение радара запоминается и возвращается при выходе из sat. */
  var SAT_OPACITY = 0.5;
  var radarOpacityMem = 100; /* значение слайдера прозрачности до входа в sat */

  /* ─── Определение устройства: мобильный → меньше кэш, легче обработка, DPR-потолок ─── */
  var IS_MOBILE = matchMedia('(max-width: 768px)').matches || matchMedia('(pointer: coarse)').matches;
  var REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2); /* потолок 2: выше — только расход памяти */

  var BUILTIN_RADAR = [
    { v: 70, r: [113, 0, 0], l: '70 dBZ' },
    { v: 65, r: [168, 0, 254], l: '65 dBZ' },
    { v: 60, r: [244, 0, 244], l: '60 dBZ' },
    { v: 55, r: [0, 168, 0], l: '55 dBZ' },
    { v: 50, r: [73, 219, 0], l: '50 dBZ' },
    { v: 40, r: [254, 58, 54], l: '40 dBZ' },
    { v: 35, r: [254, 125, 0], l: '35 dBZ' },
    { v: 30, r: [254, 254, 0], l: '30 dBZ' },
    { v: 25, r: [0, 0, 125], l: '25 dBZ' },
    { v: 20, r: [0, 0, 205], l: '20 dBZ' },
    { v: 15, r: [0, 76, 254], l: '15 dBZ' },
    { v: 10, r: [0, 168, 254], l: '10 dBZ' },
    { v: 5, r: [83, 254, 56], l: '5 dBZ' }
  ];

  var BUILTIN_WX = [
    { v: 70, r: [43, 43, 43], l: 'Смерч' },
    { v: 65, r: [128, 60, 110], l: 'Шквал сильный' },
    { v: 59, r: [204, 117, 181], l: 'Шквал умеренный' },
    { v: 57, r: [253, 201, 239], l: 'Шквал слабый' },
    { v: 54, r: [77, 57, 35], l: 'Град сильный' },
    { v: 52, r: [112, 84, 51], l: 'Град умеренный' },
    { v: 50, r: [161, 123, 79], l: 'Град слабый' },
    { v: 48, r: [255, 61, 61], l: 'Гроза A+ (>90%)' },
    { v: 46, r: [220, 80, 80], l: 'Гроза A (71-90%)' },
    { v: 45, r: [242, 186, 156], l: 'Гроза B (30-70%)' },
    { v: 37, r: [15, 55, 107], l: 'Ливень сильный' },
    { v: 35, r: [37, 87, 152], l: 'Ливень умеренный' },
    { v: 30, r: [75, 149, 247], l: 'Ливень слабый' },
    { v: 28, r: [238, 240, 132], l: 'Осадки сильные' },
    { v: 24, r: [26, 97, 64], l: 'Осадки умеренные' },
    { v: 16, r: [53, 146, 103], l: 'Осадки слабые' },
    { v: 13, r: [88, 249, 174], l: 'Морось' },
    { v: 9, r: [129, 204, 223], l: 'Легкая морось' },
    { v: 6, r: [145, 145, 145], l: 'Облака' },
    { v: 5, r: [107, 107, 107], l: 'Нет явления' }
  ];

  var S = {
    ts: 0, px: 1, layer: 'radar', playing: false, timer: null, speedI: 0, speeds: [1, 2, 4],
    frameI: 0, frames: [], cache: new Map(), pending: new Set(), failed: new Set(),
    cacheMax: (IS_MOBILE ? 130 : 400), loadN: 0, manualTime: false, legendVis: true, smooth: false, smoothStrength: 1,
    fade: { active: false, start: 0, duration: 300, alpha: 1 },
    dbzVisible: true, /* показ слоя осадков (кнопка-«глаз») */
    pxLevels: [0.5, 1, 2, 4], pxIndex: 1,
    ruler: { active: false, points: [], markers: [], polyline: null, label: null, segmentLabels: [] }
  };
  S.px = S.pxLevels[S.pxIndex];
  var palettes = { radar: { list: [], activeIdx: 0 }, wx: { list: [], activeIdx: 0 }, sat: { byChannel: {} } };
  /* ─── Палитры спутника: по одной корзине на канал (palettes.sat.byChannel[chId] = {list, activeIdx}).
     Фасад .list/.activeIdx через геттеры указывает на канал, выбранный в модалке (satModalChId),
     поэтому ВЕСЬ существующий код модалки (список/создание/удаление/экспорт) работает без правок ─── */
  var satModalChId = 'ir108';
  Object.defineProperty(palettes.sat, 'list', {
    get: function() { return satBucket(satModalChId).list; },
    set: function(v) { satBucket(satModalChId).list = v; }
  });
  Object.defineProperty(palettes.sat, 'activeIdx', {
    get: function() { return satBucket(satModalChId).activeIdx; },
    set: function(v) { satBucket(satModalChId).activeIdx = v; }
  });
  /* Корзина палитр канала: создаётся лениво, всегда начинается со встроенных */
  function satBucket(chId) {
    var bc = palettes.sat.byChannel;
    if (!bc[chId]) {
      var ch = null;
      for (var i = 0; i < SAT_CHANNELS.length; i++) if (SAT_CHANNELS[i].id === chId) { ch = SAT_CHANNELS[i]; break; }
      var builtins = BUILTIN_SAT[chId];
      if (!builtins) {
        /* RGB-канал: палитра только для легенды (тайлы уже цветные, реколоризация не применяется) */
        var rows = (ch && ch.legend && ch.legend.rows) || [];
        var items = rows.map(function(r, j) { var c = hexToRgb(r[0]) || { r: 128, g: 128, b: 128 }; return { v: (rows.length - j) * 40, r: [c.r, c.g, c.b], l: r[1] }; });
        builtins = [{ name: 'Стандарт (цветной канал)', items: items, builtin: true, noRecolor: true, legendOnly: true }];
      }
      bc[chId] = { list: builtins.slice(), activeIdx: 0 };
    }
    return bc[chId];
  }
  /* Активная палитра канала, который сейчас на карте */
  function satActivePalette() {
    var b = satBucket(SAT_CHANNELS[satChIdx].id);
    if (b.activeIdx >= b.list.length) b.activeIdx = 0;
    return b.list[b.activeIdx] || null;
  }

  var eumetsatLayer = null;
  var satOldLayer = null;      /* предыдущий слой — снимается после загрузки нового (без «чёрной вспышки») */
  var satLoading = false;      /* индикация загрузки WMS-тайлов */
  var satErrToastTs = 0;       /* троттлинг тоста об ошибке */

  /* ─── Каналы EUMETSAT (WMS view.eumetsat.int, проверенные слои msg_fes:*).
     day:true — канал информативен только в светлое время суток.
     legend: grad — градиентная шкала, rows — дискретные строки ─── */
  var SAT_CHANNELS = [
    { id: 'ir108', gray: true, label: 'IR 10.8 (ИК)',        wms: 'msg_fes:ir108',            legend: { grad: ['#ffffff', '#999999', '#222222'], rows: [['#ffffff', 'Очень холодные вершины (грозы)'], ['#999999', 'Облака среднего яруса'], ['#333333', 'Тепло / земля / море']] } },
    { id: 'wv062', gray: true, label: 'WV 6.2 (водяной пар)', wms: 'msg_fes:wv062',           legend: { grad: ['#ffffff', '#888888', '#1a1a1a'], rows: [['#ffffff', 'Влажная верхняя тропосфера'], ['#333333', 'Сухой воздух']] } },
    { id: 'vis006', gray: true, label: 'VIS 0.6 (видимый)',    wms: 'msg_fes:vis006', day: true, legend: { rows: [['#ffffff', 'Яркие облака / снег'], ['#888888', 'Тонкая облачность'], ['#222222', 'Поверхность (день)']] } },
    { id: 'rgb_natural', label: 'Натуральные цвета',    wms: 'msg_fes:rgb_natural', day: true, legend: { rows: [['#f5f5f5', 'Водяные облака'], ['#7fd4e6', 'Лёд / снег (циан)'], ['#3d7a3d', 'Растительность']] } },
    { id: 'rgb_microphysics', label: 'Микрофизика облаков', wms: 'msg_fes:rgb_microphysics', legend: { rows: [['#d4553d', 'Мощные капельные облака'], ['#e6d44f', 'Тонкие перистые'], ['#4f66e6', 'Ледяные вершины']] } },
    { id: 'rgb_convection', label: 'Конвекция',         wms: 'msg_fes:rgb_convection', legend: { rows: [['#e6e64f', 'Сильная конвекция (жёлтое)'], ['#b34fe6', 'Развивающиеся ячейки'], ['#4f9ae6', 'Зрелые наковальни']] } },
    { id: 'rgb_fog',     label: 'Туман (ночь)',         wms: 'msg_fes:rgb_fog',         legend: { rows: [['#4fe67a', 'Туман / низкая облачность'], ['#e64f4f', 'Плотные облака'], ['#3d3d80', 'Ясно (ночь)']] } },
    { id: 'rgb_dust',    label: 'Пыль',                 wms: 'msg_fes:rgb_dust',        legend: { rows: [['#e654c8', 'Пыль (розовое)'], ['#c8a03c', 'Сухой воздух'], ['#5a78b4', 'Облака']] } },
    { id: 'rgb_airmass', label: 'Воздушные массы',      wms: 'msg_fes:rgb_airmass',     legend: { rows: [['#4fb4e6', 'Холодная ВМ (голубое)'], ['#4fe6b4', 'Тёплая ВМ (зелёное)'], ['#b44fe6', 'Стратосферное вторжение']] } },
    { id: 'cth', gray: true, label: 'Высота вершин облаков', wms: 'msg_fes:cth',            legend: { rows: [['#d4553d', 'Очень высокие (>12 км)'], ['#e6d44f', 'Средние (5–8 км)'], ['#4f66e6', 'Низкие (<3 км)']] } },
    { id: 'fire',        label: 'Пожары',               wms: 'msg_fes:fire',            legend: { rows: [['#ff3d3d', 'Активный очаг'], ['#ffb43d', 'Вероятный очаг']] } },
    { id: 'rdt',         label: 'Грозы (RDT)',          wms: 'msg_fes:rdt',             legend: { rows: [['#ff3d3d', 'Зрелая грозовая ячейка'], ['#ffb43d', 'Развивающаяся'], ['#ffe63d', 'Зарождающаяся']] } },
    { id: 'gii_kindex', gray: true, label: 'K-индекс',             wms: 'msg_fes:gii_kindex',      legend: { rows: [['#d4553d', 'K > 35 (высокая неустойчивость)'], ['#e6d44f', 'K 25–35 (умеренная)'], ['#4f66e6', 'K < 25 (стабильно)']] } },
    { id: 'gii_liftedindex', gray: true, label: 'Lifted Index',     wms: 'msg_fes:gii_liftedindex', legend: { rows: [['#d4553d', 'LI < −4 (сильная неустойчивость)'], ['#e6d44f', 'LI −4…0 (умеренная)'], ['#4f66e6', 'LI > 0 (стабильно)']] } }
  ];

  /* ─── БЛОК C: встроенные палитры спутника (порог = яркость пикселя 0–255, шкала «v и выше») ───
     noRecolor: показываем оригинальные тайлы (палитра — только легенда).
     Цвета согласованы с тёмной темой сайта — спокойные, не кислотные. */
  var BUILTIN_SAT = {
    ir108: [
      { name: 'Классический серый', builtin: true, noRecolor: true, items: [
        { v: 230, r: [255, 255, 255], l: 'Грозовые вершины (< −55°C)' },
        { v: 180, r: [214, 214, 218], l: 'Мощные облака (−40…−55°C)' },
        { v: 120, r: [150, 150, 156], l: 'Средний ярус (−15…−40°C)' },
        { v: 60,  r: [92, 92, 98],    l: 'Низкие облака (0…−15°C)' },
        { v: 0,   r: [42, 42, 46],    l: 'Земля / море (> 0°C)' }] },
      { name: 'Усиленный IR', builtin: true, items: [
        { v: 245, r: [236, 120, 220], l: 'Экстрем. холод (< −70°C)' },
        { v: 230, r: [178, 96, 226],  l: '−60…−70°C — овершуты' },
        { v: 215, r: [104, 88, 222],  l: '−50…−60°C — мощная конвекция' },
        { v: 200, r: [86, 140, 232],  l: '−40…−50°C' },
        { v: 185, r: [96, 196, 202],  l: '−30…−40°C' },
        { v: 168, r: [110, 188, 110], l: '−20…−30°C' },
        { v: 150, r: [214, 200, 108], l: '−10…−20°C' },
        { v: 130, r: [216, 148, 92],  l: '0…−10°C' },
        { v: 105, r: [186, 106, 92],  l: 'Тёплая облачность' },
        { v: 0,   r: [72, 72, 78],    l: 'Земля / море' }] }
    ],
    wv062: [
      { name: 'Водяной пар', builtin: true, items: [
        { v: 215, r: [240, 244, 248], l: 'Очень влажный верх тропосферы' },
        { v: 180, r: [170, 196, 220], l: 'Влажно' },
        { v: 145, r: [110, 144, 182], l: 'Умеренно' },
        { v: 110, r: [82, 100, 140],  l: 'Суховато' },
        { v: 70,  r: [96, 82, 90],    l: 'Сухой воздух' },
        { v: 0,   r: [64, 50, 52],    l: 'Очень сухо (просадка)' }] },
      { name: 'WV усиленный', builtin: true, items: [
        { v: 220, r: [120, 220, 210], l: 'Насыщенные влажные зоны' },
        { v: 185, r: [96, 170, 224],  l: 'Влажные языки' },
        { v: 150, r: [96, 110, 170],  l: 'Фон' },
        { v: 110, r: [140, 100, 110], l: 'Сухие вторжения' },
        { v: 0,   r: [180, 120, 80],  l: 'Экстремально сухо' }] }
    ],
    vis006: [
      { name: 'VIS контраст', builtin: true, items: [
        { v: 220, r: [255, 255, 255], l: 'Яркие облака / снег' },
        { v: 170, r: [206, 208, 212], l: 'Плотная облачность' },
        { v: 120, r: [150, 152, 158], l: 'Тонкая облачность' },
        { v: 70,  r: [96, 98, 104],   l: 'Дымка' },
        { v: 0,   r: [40, 42, 46],    l: 'Поверхность' }] }
    ],
    cth: [
      { name: 'Высота вершин', builtin: true, items: [
        { v: 220, r: [214, 84, 78],   l: '> 12 км — экстремально высокие' },
        { v: 180, r: [224, 156, 88],  l: '10–12 км' },
        { v: 140, r: [222, 208, 110], l: '7–10 км' },
        { v: 100, r: [116, 190, 120], l: '5–7 км' },
        { v: 60,  r: [92, 148, 216],  l: '3–5 км' },
        { v: 0,   r: [80, 96, 160],   l: '< 3 км — низкие' }] }
    ],
    gii_kindex: [
      { name: 'Неустойчивость (K)', builtin: true, items: [
        { v: 200, r: [214, 84, 78],   l: 'K > 35 — высокая' },
        { v: 140, r: [224, 170, 92],  l: 'K 30–35 — значительная' },
        { v: 90,  r: [222, 208, 110], l: 'K 25–30 — умеренная' },
        { v: 0,   r: [104, 172, 116], l: 'K < 25 — стабильно' }] }
    ],
    gii_liftedindex: [
      { name: 'Неустойчивость (LI)', builtin: true, items: [
        { v: 200, r: [214, 84, 78],   l: 'LI < −6 — экстремальная' },
        { v: 140, r: [224, 170, 92],  l: 'LI −4…−6 — сильная' },
        { v: 90,  r: [222, 208, 110], l: 'LI 0…−4 — умеренная' },
        { v: 0,   r: [104, 172, 116], l: 'LI > 0 — стабильно' }] }
    ]
  };
  var satChIdx = 0;
  try { var savedCh = localStorage.getItem('satChannel'); var fi = SAT_CHANNELS.findIndex(function(c) { return c.id === savedCh; }); if (fi >= 0) satChIdx = fi; } catch (e) {}

  function satIso(ts) { return new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'); }

  /* ─── БЛОК A: устойчивая загрузка WMS ───
     Эндпоинты: [0] — основной. Зеркало добавлять сюда строкой (например, региональный прокси);
     при массовых ошибках клиент сам переключится на следующий. */
  /* ─── БЛОК A: устойчивая загрузка WMS ───
     [0] — прокси через свой домен (Vercel вне РФ + edge-кэш + без CORS),
     [1] — прямой EUMETSAT как fallback (реколоризация на нём может отключиться
     без CORS — recolorSatTile уже деградирует через catch). */
  var SAT_WMS_ENDPOINTS = ['/api/satProxy', 'https://view.eumetsat.int/geoserver/wms'];
  var satEndpointIdx = 0;

  /* LRU-кэш готовых тайлов (dataURL по полному URL — включает канал и time).
     Повторный кадр таймлайна/возврат на позицию = 0 сетевых запросов. */
  var satTileCache = new Map(), SAT_CACHE_MAX = 200;
  function satCacheSet(url, dataUrl) {
    if (satTileCache.has(url)) satTileCache.delete(url);
    else if (satTileCache.size >= SAT_CACHE_MAX) satTileCache.delete(satTileCache.keys().next().value);
    satTileCache.set(url, dataUrl);
  }

  /* Кэш реколоризованных тайлов: ключ = url + сигнатура палитры */
  var satRecolorCache = new Map(), SAT_RECOLOR_MAX = 150;

  /* Пул загрузки: не более 6 одновременных WMS-запросов, остальные ждут в очереди */
  var satQueue = [], satActiveReq = 0, SAT_MAX_PAR = 6;
  function satPump() {
    while (satActiveReq < SAT_MAX_PAR && satQueue.length) {
      var job = satQueue.shift();
      /* Тайл мог быть снят Leaflet'ом до старта загрузки (быстрое панорамирование) */
      if (job.tile._satAborted) continue;
      satActiveReq++;
      job.tile._satCounted = true;
      job.tile.src = job.url;
      /* Таймаут отсчитываем от фактического старта запроса, а не постановки в очередь */
      (function(tile) {
        tile._satTimer = setTimeout(function() {
          if (!tile._satDone && !tile._satAborted) {
            tile._satTimedOut = true;
            console.warn('[sat] таймаут тайла (12с):', tile._satUrl);
            tile.src = ''; /* провоцируем error → штатный путь retry в tileerror */
          }
        }, 12000);
      })(job.tile);
    }
  }
  function satRelease(tile) {
    if (tile._satCounted) { tile._satCounted = false; satActiveReq = Math.max(0, satActiveReq - 1); }
    satPump();
  }

  /* Счётчики прогресса для чипа: ⏳ загружено/всего */
  var satTilesTotal = 0, satTilesDone = 0;

  /* Кастомный слой: createTile с отложенной установкой src (пул) + кэш.
     _tileOnLoad/_tileOnError — приватный API Leaflet 1.9.4 (стабилен), сохраняет
     события loading/load/tileerror, на которые завязан attachSatEvents. */
  var SatWMS = L.TileLayer.WMS.extend({
    createTile: function(coords, done) {
      var tile = document.createElement('img');
      var self = this;
      /* Таймаут тайла: если за 12с не пришли ни load, ни error — тайм-аут
         (типичный симптом деградации маршрута); таймер ставит satPump при старте запроса */
      L.DomEvent.on(tile, 'load', function() { tile._satDone = true; clearTimeout(tile._satTimer); satRelease(tile); self._tileOnLoad(done, tile); });
      L.DomEvent.on(tile, 'error', function(e) { tile._satDone = true; clearTimeout(tile._satTimer); satRelease(tile); self._tileOnError(done, tile, e); });
      tile.alt = ''; tile.setAttribute('role', 'presentation');
      tile.crossOrigin = 'anonymous'; /* для fallback на прямой эндпоинт; на прокси (свой домен) безвреден */
      var url = this.getTileUrl(coords);
      tile._satUrl = url;
      var cached = satTileCache.get(url);
      if (cached) { /* мгновенно из кэша, LRU-обновление */
        satCacheSet(url, cached);
        tile._fromCache = true;
        tile.src = cached;
      } else {
        satQueue.push({ tile: tile, url: url });
        satPump();
      }
      return tile;
    },
    _removeTile: function(key) {
      var t = this._tiles[key];
      if (t && t.el) { t.el._satAborted = true; clearTimeout(t.el._satTimer); } /* не грузить снятые тайлы */
      return L.TileLayer.WMS.prototype._removeTile.call(this, key);
    }
  });

  /* Создание WMS-слоя: канал + опционально время кадра (null = актуальный «LIVE» кадр) */
  function createEumetsatLayer(opacity, channel, ts) {
    var ch = channel || SAT_CHANNELS[satChIdx];
    var params = {
      layers: ch.wms,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      attribution: '© EUMETSAT',
      opacity: opacity !== undefined ? opacity : 0.8,
      tileSize: 256,
      zIndex: 10,           /* поверх тёмной подложки (zIndex 5) на светлых темах */
      maxZoom: 10,          /* как у карты — не гонять WMS на бесполезных зумах */
      updateWhenIdle: false, /* обновление во время движения — карта «живее» */
      keepBuffer: 2
    };
    if (ts) params.time = satIso(ts);
    return new SatWMS(SAT_WMS_ENDPOINTS[satEndpointIdx], params);
  }

  /* ═══ БЛОК D: калибровка данных ═══
     Спутник: сырая яркость 0–255 → калибровочная кривая (авто-контраст по перцентилям
     p2/p98 ИЛИ ручные offset/gain/gamma) → пороги палитры.
     Радар: dbz_cal = raw*dbzGain + dbzOffset перед сравнением с порогами палитры.
     Ключ localStorage 'calibration' — НОВЫЙ (mapView не трогаем: калибровка — про данные,
     а не про вид карты, и живёт по своим правилам сброса). */
  var CAL = { sat: { offset: 0, gain: 1, gamma: 1, auto: true }, radar: { dbzOffset: 0, dbzGain: 1 } };
  try {
    var savedCal = JSON.parse(localStorage.getItem('calibration') || 'null');
    if (savedCal && typeof savedCal === 'object') {
      if (savedCal.sat) { CAL.sat.offset = +savedCal.sat.offset || 0; CAL.sat.gain = +savedCal.sat.gain || 1; CAL.sat.gamma = +savedCal.sat.gamma || 1; CAL.sat.auto = savedCal.sat.auto !== false; }
      if (savedCal.radar) { CAL.radar.dbzOffset = +savedCal.radar.dbzOffset || 0; CAL.radar.dbzGain = +savedCal.radar.dbzGain || 1; }
    }
  } catch (e) {}
  function saveCalibration() { try { localStorage.setItem('calibration', JSON.stringify(CAL)); } catch (e) {} }
  /* Авто-контраст: перцентили p2/p98 гистограммы первого обработанного тайла канала
     (устойчивы к выбросам); сбрасываются при смене канала и по ↻ */
  var satAutoStretch = {}; /* { chId: {p2, p98} } */
  function computeAutoStretch(chId, d) { /* d — ImageData.data 256×256 */
    var hist = new Uint32Array(256), n = 0;
    for (var i = 0; i < d.length; i += 16) { /* каждый 4-й пиксель — достаточно для гистограммы */
      if (!d[i + 3]) continue;
      hist[((d[i] + d[i + 1] + d[i + 2]) / 3) | 0]++; n++;
    }
    if (n < 500) return null; /* почти пустой тайл — не по чему калиброваться */
    var lo = Math.round(n * 0.02), hi = Math.round(n * 0.98), acc = 0, p2 = 0, p98 = 255;
    for (var v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lo) { p2 = v; break; } }
    acc = 0;
    for (var w = 0; w < 256; w++) { acc += hist[w]; if (acc >= hi) { p98 = w; break; } }
    if (p98 - p2 < 10) return null; /* вырожденная гистограмма */
    satAutoStretch[chId] = { p2: p2, p98: p98 };
    return satAutoStretch[chId];
  }
  function satCalIsIdentity() {
    if (CAL.sat.auto) { var st = satAutoStretch[SAT_CHANNELS[satChIdx].id]; return !st || (st.p2 <= 5 && st.p98 >= 250); }
    return CAL.sat.offset === 0 && CAL.sat.gain === 1 && CAL.sat.gamma === 1;
  }
  function satCalValue(v, st) { /* калибровочная кривая яркости */
    if (CAL.sat.auto) { if (st) v = (v - st.p2) / (st.p98 - st.p2) * 255; }
    else {
      v = (v - CAL.sat.offset) * CAL.sat.gain;
      if (CAL.sat.gamma !== 1) v = Math.pow(Math.max(0, v) / 255, CAL.sat.gamma) * 255;
    }
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }
  function satCalSignature() { if (CAL.sat.auto) { var st = satAutoStretch[SAT_CHANNELS[satChIdx].id]; return st ? 'a' + st.p2 + ':' + st.p98 : 'a'; } return 'm' + CAL.sat.offset + ',' + CAL.sat.gain + ',' + CAL.sat.gamma; }
  function calDbz(v) { return v * CAL.radar.dbzGain + CAL.radar.dbzOffset; }
  function radarCalIsDefault() { return CAL.radar.dbzOffset === 0 && CAL.radar.dbzGain === 1; }

  /* ─── Реколоризация + калибровка grayscale-тайла (через procQueue, ≤8мс/кадр).
     Обрабатываем тайл, если есть палитра-перекраска ИЛИ калибровка не тождественна
     (тогда для noRecolor-палитр выводим откалиброванный серый) ─── */
  function satPalSignature(pal) { return pal.name + '|' + pal.items.map(function(i) { return i.v + ':' + i.r.join(','); }).join(';'); }
  function recolorSatTile(tile) {
    var ch = SAT_CHANNELS[satChIdx];
    if (!ch.gray) return;
    var pal = satActivePalette();
    var wantRecolor = pal && !pal.noRecolor && !pal.legendOnly && pal.items && pal.items.length;
    var wantCal = !satCalIsIdentity() || (CAL.sat.auto && !satAutoStretch[ch.id]); /* авто без статистики — нужно её собрать */
    if (!wantRecolor && !wantCal) return;
    var key = tile._satUrl + '§' + (wantRecolor ? satPalSignature(pal) : 'gray') + '§' + satCalSignature();
    var hit = satRecolorCache.get(key);
    /* Подмена src — тоже через очередь: гарантирует, что кэширование ОРИГИНАЛА
       (задание поставлено раньше в tileload) успеет отработать до перекраски */
    if (hit) { enqueueTile({ run: function() { if (!tile._satAborted) { tile._recolored = true; tile.src = hit; } } }); return; }
    var items = wantRecolor ? pal.items : null; /* отсортированы по v убыв. */
    enqueueTile({ run: function() {
      try {
        if (tile._satAborted) return;
        var c = document.createElement('canvas'); c.width = c.height = 256;
        var cc = c.getContext('2d');
        cc.drawImage(tile, 0, 0, 256, 256);
        var idd = cc.getImageData(0, 0, 256, 256), d = idd.data;
        /* Первый тайл канала при авто-калибровке — источник гистограммы */
        var st = CAL.sat.auto ? (satAutoStretch[ch.id] || computeAutoStretch(ch.id, d)) : null;
        if (!items && satCalIsIdentity()) return; /* после статистики выяснилось: менять нечего */
        for (var i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue; /* прозрачное — не трогаем */
          var v = satCalValue((d[i] + d[i + 1] + d[i + 2]) / 3, st);
          if (items) {
            for (var j = 0; j < items.length; j++) {
              if (v >= items[j].v) { d[i] = items[j].r[0]; d[i + 1] = items[j].r[1]; d[i + 2] = items[j].r[2]; break; }
            }
          } else { d[i] = d[i + 1] = d[i + 2] = v | 0; } /* noRecolor: откалиброванный серый */
        }
        cc.putImageData(idd, 0, 0);
        var du = c.toDataURL();
        if (satRecolorCache.size >= SAT_RECOLOR_MAX) satRecolorCache.delete(satRecolorCache.keys().next().value);
        satRecolorCache.set(key, du);
        tile._recolored = true;
        tile.src = du;
      } catch (err) { /* canvas tainted (нет CORS) — оставляем оригинал, без падения */ }
    } });
  }

  /* Индикация загрузки/ошибок WMS + retry 1с→2с→4с (макс. 3) + fallback-эндпоинт */
  var satFailStreak = 0;
  var satErrType = 'net'; /* 'timeout' | 'net' — для чипа и тостов */
  function attachSatEvents(lyr) {
    var tries = {};
    lyr.on('loading', function() { if (lyr === eumetsatLayer) { satLoading = true; satTilesTotal = 0; satTilesDone = 0; $('pulse').classList.add('busy'); satUpdateChip(); } });
    lyr.on('tileloadstart', function() { if (lyr === eumetsatLayer) { satTilesTotal++; satUpdateChip(); } });
    lyr.on('tileload', function(e) {
      if (lyr === eumetsatLayer && !e.tile._countedDone) { e.tile._countedDone = true; satTilesDone++; satFailStreak = 0; satUpdateChip(); }
      /* Кэшируем оригинал (если это не data: из кэша) — лениво, через procQueue */
      var t = e.tile;
      if (!t._fromCache && !t._recolored && t._satUrl && t.src && t.src.indexOf('data:') !== 0) {
        (function(tile) { enqueueTile({ run: function() {
          try {
            if (satTileCache.has(tile._satUrl)) return;
            var c = document.createElement('canvas'); c.width = c.height = 256;
            c.getContext('2d').drawImage(tile, 0, 0, 256, 256);
            satCacheSet(tile._satUrl, c.toDataURL());
          } catch (err) { /* нет CORS — кэш недоступен, тайлы всё равно показываются */ }
        } }); })(t);
      }
      if (!t._recolored) recolorSatTile(t);
    });
    lyr.on('load', function() { if (lyr === eumetsatLayer) { satLoading = false; $('pulse').classList.remove('busy'); satUpdateChip(); } });
    lyr.on('tileerror', function(e) {
      var k = e.coords.x + ':' + e.coords.y + ':' + e.coords.z;
      var n = tries[k] || 0;
      if (lyr === eumetsatLayer) satTilesDone++;
      /* Диагностика: тайм-аут отличаем от сетевой/серверной ошибки */
      satErrType = (e.tile && e.tile._satTimedOut) ? 'timeout' : 'net';
      console.warn('[sat] ошибка тайла (' + satErrType + '), попытка ' + (n + 1) + '/4:', e.tile && e.tile._satUrl);
      if (n < 3) { /* экспоненциальный retry: 1с → 2с → 4с */
        tries[k] = n + 1;
        setTimeout(function() { if (map.hasLayer(lyr) && e.tile && !e.tile._satAborted) { e.tile._satDone = false; e.tile._satTimedOut = false; e.tile.src = lyr.getTileUrl(e.coords); } }, 1000 * Math.pow(2, n));
      } else {
        satFailStreak++;
        if (lyr === eumetsatLayer) { satLoading = false; $('pulse').classList.remove('busy'); } /* не висим в .busy вечно */
        var now = Date.now();
        if (now - satErrToastTs > 30000) {
          satErrToastTs = now;
          toast(satErrType === 'timeout' ? '⚠️ Спутник: тайм-аут, повтор…' : '⚠️ Спутник недоступен — нажмите ↻ для повтора');
        }
        satUpdateChip(true);
        /* Fallback: 6+ полностью упавших тайлов подряд и есть зеркало → переключаемся */
        if (satFailStreak >= 6 && SAT_WMS_ENDPOINTS.length > 1) {
          satFailStreak = 0;
          satEndpointIdx = (satEndpointIdx + 1) % SAT_WMS_ENDPOINTS.length;
          toast(satEndpointIdx === 0 ? 'Спутник: возврат на прокси-сервер…' : 'Спутник: переключение на прямой сервер EUMETSAT…');
          setTimeout(function() { satApplyTime(true); }, 1000);
        }
      }
    });
  }

  function loadPalettesFromStorage() {
    try {
      var r = localStorage.getItem('radarPalettes');
      if (r) {
        var parsedR = JSON.parse(r);
        if (Array.isArray(parsedR) && parsedR.length > 0) {
          var customR = parsedR.filter(function(p) { return !p.builtin; });
          palettes.radar.list = [{ name: 'Стандартная (радар)', items: BUILTIN_RADAR, builtin: true }].concat(customR);
        } else { initDefaultPalettes('radar'); }
      } else { initDefaultPalettes('radar'); }

      var w = localStorage.getItem('wxPalettes');
      if (w) {
        var parsedW = JSON.parse(w);
        if (Array.isArray(parsedW) && parsedW.length > 0) {
          var customW = parsedW.filter(function(p) { return !p.builtin; });
          palettes.wx.list = [{ name: 'Стандартная (явления)', items: BUILTIN_WX, builtin: true }].concat(customW);
        } else { initDefaultPalettes('wx'); }
      } else { initDefaultPalettes('wx'); }
    } catch (e) { initDefaultPalettes('radar'); initDefaultPalettes('wx'); }

    /* Палитры спутника: ключ satPalettes = { chId: { custom: [...], activeIdx: n } }.
       Встроенные не сериализуем — восстанавливаются из BUILTIN_SAT */
    try {
      var sp = JSON.parse(localStorage.getItem('satPalettes') || 'null');
      if (sp && typeof sp === 'object') {
        Object.keys(sp).forEach(function(chId) {
          var b = satBucket(chId); var rec = sp[chId] || {};
          var custom = Array.isArray(rec.custom) ? rec.custom.filter(function(p) { return p && !p.builtin && Array.isArray(p.items); }) : [];
          b.list = b.list.filter(function(p) { return p.builtin; }).concat(custom);
          b.activeIdx = (typeof rec.activeIdx === 'number' && rec.activeIdx >= 0 && rec.activeIdx < b.list.length) ? rec.activeIdx : 0;
        });
      }
    } catch (e) {}

    if (palettes.radar.activeIdx >= palettes.radar.list.length) palettes.radar.activeIdx = 0;
    if (palettes.wx.activeIdx >= palettes.wx.list.length) palettes.wx.activeIdx = 0;
  }
  function initDefaultPalettes(layer) { if (layer === 'sat') return; var items = layer === 'radar' ? BUILTIN_RADAR : BUILTIN_WX; var name = layer === 'radar' ? 'Стандартная (радар)' : 'Стандартная (явления)'; palettes[layer].list = [{ name: name, items: items, builtin: true }]; palettes[layer].activeIdx = 0; savePalettesToStorage(layer); }
  function savePalettesToStorage(layer) {
    try {
      if (layer === 'sat') {
        /* Сериализуем только пользовательские палитры по каналам */
        var out = {};
        Object.keys(palettes.sat.byChannel).forEach(function(chId) {
          var b = palettes.sat.byChannel[chId];
          out[chId] = { custom: b.list.filter(function(p) { return !p.builtin; }), activeIdx: b.activeIdx };
        });
        localStorage.setItem('satPalettes', JSON.stringify(out));
        return;
      }
      localStorage.setItem(layer + 'Palettes', JSON.stringify(palettes[layer].list));
    } catch (e) {}
  }
  function getCurrentPaletteItems() {
    var layer = S.layer;
    if (layer === 'sat') { var p = satActivePalette(); return (p && p.items) || []; } /* палитра активного канала */
    var list = palettes[layer].list; var idx = palettes[layer].activeIdx;
    if (!list || list.length === 0 || idx >= list.length) { initDefaultPalettes(layer); idx = 0; }
    return list[idx].items;
  }

  /* ─── Время: сетка и глубина истории зависят от слоя (радар 10 мин / спутник 15 мин) ─── */
  function stepSec() { return S.layer === 'sat' ? SAT_STEP : STEP; }
  function delaySec() { return S.layer === 'sat' ? SAT_DELAY : DELAY; }
  function histSec() { return S.layer === 'sat' ? SAT_HISTORY_SEC : MAX_HISTORY_SEC; }
  function nowTs() { return Math.floor((Date.now() / 1000 - delaySec()) / stepSec()) * stepSec(); }
  function minTs() { return nowTs() - histSec(); }
  S.ts = nowTs();
  function setTime(t, m) { S.ts = Math.max(minTs(), Math.min(t, nowTs())); S.manualTime = !!m; }

  var map = L.map('map', { center: [57, 55], zoom: 6, minZoom: 3, maxZoom: 10, zoomControl: false, fadeAnimation: false, markerZoomAnimation: false, scrollWheelZoom: true, doubleClickZoom: true, boxZoom: true, touchZoom: true, keyboard: true });
  /* crossOrigin: 'anonymous' — CARTO отдаёт CORS *; нужен для экспорта композита
     «карта+слой» (drawImage базовых тайлов без tainted canvas) */
  var darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { subdomains: 'abcd', maxZoom: 20, crossOrigin: 'anonymous', attribution: '© OpenStreetMap, © CARTO' });
  var lightTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { subdomains: 'abcd', maxZoom: 20, crossOrigin: 'anonymous', attribution: '© OpenStreetMap, © CARTO' });
  /* «Схема» — CARTO Voyager: легальный публичный стиль, визуально близкий к схеме Google Maps
     (светлая карта, дороги, подписи). Неофициальные тайлы mt*.google.com/vt НЕ используем —
     нарушение Google ToS без API-ключа и нестабильность. */
  var voyagerTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { subdomains: 'abcd', maxZoom: 20, crossOrigin: 'anonymous', attribution: '© OpenStreetMap, © CARTO' });

  /* ─── БЛОК B: тёмная подложка под спутник на светлых темах ───
     Диагноз: тайлы EUMETSAT грузятся и на light/scheme (сеть/_tiles в норме),
     но grayscale-снимки с белыми «холодными вершинами» при SAT_OPACITY=0.5
     сливаются с белой картой (light_all/Voyager) — контраст, а не сеть.
     Решение (вариант 1, как windy/rainviewer): под спутник подкладываем тёмный
     тайл-слой; тема UI пользователя не меняется. zIndex: подложка 5, спутник 10
     (базовая карта — дефолтный 1). */
  var satBackdropLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { subdomains: 'abcd', maxZoom: 20, zIndex: 5, crossOrigin: 'anonymous', attribution: '© OpenStreetMap, © CARTO' });
  function satBackdropActive() { return map.hasLayer(satBackdropLayer); }
  function updateSatBackdrop(animate) {
    var need = (S.layer === 'sat' && currentTheme !== 'dark');
    if (need && !map.hasLayer(satBackdropLayer)) {
      if (animate && !REDUCE_MOTION) {
        /* плавное проявление ~300мс через rAF — без резкого «потемнения» карты */
        satBackdropLayer.setOpacity(0); satBackdropLayer.addTo(map);
        var t0 = performance.now(), D = 300;
        (function step() { var k = Math.min(1, (performance.now() - t0) / D); satBackdropLayer.setOpacity(k); if (k < 1 && map.hasLayer(satBackdropLayer)) requestAnimationFrame(step); })();
      } else { satBackdropLayer.setOpacity(1); satBackdropLayer.addTo(map); }
      satUpdateChip();
    } else if (!need && map.hasLayer(satBackdropLayer)) {
      map.removeLayer(satBackdropLayer); satBackdropLayer.setOpacity(1);
      satUpdateChip();
    }
  }
  darkTileLayer.addTo(map);
  L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);
  setTimeout(function() { map.invalidateSize(); }, 500);

  var canvas = $('radar'), ctx = canvas.getContext('2d');
  /* ─── Retina: физический размер = CSS-пиксели × DPR, вся геометрия остаётся в CSS-пикселях
     благодаря ctx.setTransform(DPR,...) в doRender ─── */
  function resizeCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * DPR);
    canvas.height = Math.round(innerHeight * DPR);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    updThumb(); schedRender();
  }
  addEventListener('resize', resizeCanvas); resizeCanvas();

  /* ─── Crossfade кадров радара: снимок текущего canvas в offscreen-канвас,
     старый кадр гаснет (1-alpha), новый проявляется (alpha) через rAF ─── */
  var prevFrame = { canvas: document.createElement('canvas'), valid: false };
  function startFrameFade() {
    if (S.layer === 'sat') return;
    try {
      if (canvas.width > 0 && canvas.height > 0) {
        prevFrame.canvas.width = canvas.width; prevFrame.canvas.height = canvas.height;
        prevFrame.canvas.getContext('2d').drawImage(canvas, 0, 0);
        prevFrame.valid = true;
      }
    } catch (e) { prevFrame.valid = false; }
    S.fade.active = true; S.fade.start = performance.now(); S.fade.alpha = 0;
  }

  /* ─── Статус-чип (#dbg): слой · время кадра · состояние ─── */
  function setChip(text) { var el = $('dbg'); if (el.textContent !== text) el.textContent = text; }
  function satUpdateChip(err) {
    if (S.layer !== 'sat') return;
    var ch = SAT_CHANNELS[satChIdx];
    /* Пока не пришёл ни один тайл — честная «загрузка…» вместо ложного LIVE */
    if (satLoading && satTilesDone === 0) { setChip('🛰 ' + ch.label + ' · загрузка… · © EUMETSAT'); return; }
    var live = S.ts >= nowTs();
    var tstr = new Date((live ? nowTs() : S.ts) * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    var prog = satLoading ? ' · ⏳' + Math.min(satTilesDone, satTilesTotal) + '/' + satTilesTotal : '';
    var errTxt = err ? (satErrType === 'timeout' ? ' · ⚠️ таймаут' : ' · ⚠️ сеть/сервер') : '';
    var bd = satBackdropActive() ? ' · подложка' : '';
    var scal = (!CAL.sat.auto && !satCalIsIdentity()) ? ' · калибр.' : '';
    setChip('🛰 ' + ch.label + ' · ' + tstr + ' МСК' + (live ? ' (LIVE, ~15 мин задержка)' : '') + prog + errTxt + bd + scal + ' · непрозр. 50% · © EUMETSAT');
  }

  /* ─── Применение времени/канала спутника: новый WMS-слой поверх, старый снимается
     после загрузки нового — ни пустой карты, ни «чёрной вспышки».
     Дебаунс 180мс гасит лавину запросов при перетаскивании трека ─── */
  var satSwapTmr = null;
  function satApplyTime(immediate) {
    if (S.layer !== 'sat') return;
    clearTimeout(satSwapTmr);
    satSwapTmr = setTimeout(function() {
      if (S.layer !== 'sat') return;
      var ch = SAT_CHANNELS[satChIdx];
      var live = S.ts >= nowTs();
      var old = eumetsatLayer;
      /* Недогруженный «предыдущий предыдущий» слой убираем сразу */
      if (satOldLayer && map.hasLayer(satOldLayer)) { map.removeLayer(satOldLayer); satOldLayer = null; }
      var lyr = createEumetsatLayer(SAT_OPACITY, ch, live ? null : S.ts); /* прозрачность фиксирована — не скачет при смене кадра/канала */
      attachSatEvents(lyr);
      lyr.addTo(map);
      eumetsatLayer = lyr;
      if (old) {
        satOldLayer = old;
        var rm = function() { if (satOldLayer === old && map.hasLayer(old)) { map.removeLayer(old); satOldLayer = null; } };
        lyr.once('load', rm);
        setTimeout(rm, 5000); /* страховка, если 'load' не пришёл (ошибки тайлов) */
      }
      satUpdateChip();
    }, immediate ? 0 : 180);
  }

  /* ─── Crossfade канваса радара при переключении radar↔sat (вместо резкого display) ─── */
  function canvasShouldHide() { return S.layer === 'sat' || !S.dbzVisible; }
  function fadeCanvas(show) {
    var target = parseInt($('opacity-slider').value) / 100;
    if (REDUCE_MOTION) { canvas.style.display = show ? 'block' : 'none'; canvas.style.opacity = target; return; }
    if (show) {
      canvas.style.display = 'block'; canvas.style.opacity = 0; void canvas.offsetWidth;
      canvas.classList.add('cfade'); canvas.style.opacity = target;
      setTimeout(function() { canvas.classList.remove('cfade'); }, 300);
    } else {
      canvas.classList.add('cfade'); canvas.style.opacity = 0;
      setTimeout(function() { canvas.classList.remove('cfade'); if (canvasShouldHide()) canvas.style.display = 'none'; canvas.style.opacity = target; }, 280);
    }
  }

  /* ─── БЛОК D: скрытие/показ слоя dBZ (кнопка-«глаз») ─── */
  function applyDbzUI() {
    var btn = $('btn-toggle-dbz');
    if (!btn) return;
    btn.textContent = S.dbzVisible ? '👁' : '🙈';
    btn.title = S.dbzVisible ? 'Скрыть слой осадков' : 'Показать слой осадков';
    btn.classList.toggle('on', !S.dbzVisible);
    /* Слайдер прозрачности неактивен, пока слой скрыт */
    var slider = $('opacity-slider');
    if (S.layer !== 'sat') { slider.disabled = !S.dbzVisible; $('opacity-control').classList.toggle('disabled', !S.dbzVisible); }
    /* Легенда приглушается + подпись «слой скрыт» в чипе (см. doRender) */
    $('legend').classList.toggle('dbz-off', !S.dbzVisible && S.layer !== 'sat');
  }
  function toggleDbz() {
    if (S.layer === 'sat') { toast('В режиме спутника слой dBZ не отображается'); return; }
    S.dbzVisible = !S.dbzVisible;
    fadeCanvas(S.dbzVisible); /* плавное затухание/проявление 250–300мс, reduced-motion — мгновенно */
    applyDbzUI();
    if (S.dbzVisible) schedRender(); else { hidePopup(); hoverEl.style.display = 'none'; }
    saveViewDebounced();
    toast(S.dbzVisible ? 'Слой осадков показан' : 'Слой осадков скрыт');
  }

  function lon2x(lon, z) { return Math.floor((lon + 180) / 360 * (1 << z)); }
  function lat2y(lat, z) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z)); }
  function x2lon(x, z) { return x / (1 << z) * 360 - 180; }
  function y2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / (1 << z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
  function visTiles() { var b = map.getBounds(), mx = (1 << FZ) - 1, x0 = Math.max(0, lon2x(b.getWest(), FZ)), x1 = Math.min(mx, lon2x(b.getEast(), FZ)), y0 = Math.max(0, lat2y(b.getNorth(), FZ)), y1 = Math.min(mx, lat2y(b.getSouth(), FZ)), l = []; for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) l.push({ x: x, y: y }); return l; }
  function tileRect(x, y) { var nw = map.latLngToContainerPoint(L.latLng(y2lat(y, FZ), x2lon(x, FZ))); var se = map.latLngToContainerPoint(L.latLng(y2lat(y + 1, FZ), x2lon(x + 1, FZ))); return { sx: Math.round(nw.x), sy: Math.round(nw.y), sw: Math.round(se.x - nw.x), sh: Math.round(se.y - nw.y) }; }
  function makeCK(l, t, p, x, y) { return l + '|' + t + '|' + p + '|' + x + '|' + y; }
  function CK(x, y) { return makeCK(S.layer, S.ts, S.px, x, y); }
  function getColor(raw) { if (raw < MDBZ) return null; var v = calDbz(raw); /* калибровка dBZ (Блок D) */ var items = getCurrentPaletteItems(); for (var i = 0; i < items.length; i++) { if (v >= items[i].v) return items[i].r; } return null; }

  function interpolateRaw(raw, w, h, scale) {
    var nw = w * scale, nh = h * scale; var newRaw = new Float32Array(nw * nh);
    for (var y = 0; y < nh; y++) { for (var x = 0; x < nw; x++) {
      var gx = x / scale, gy = y / scale; var x0 = Math.floor(gx), y0 = Math.floor(gy); var x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
      var tx = gx - x0, ty = gy - y0; var p00 = raw[y0 * w + x0], p01 = raw[y0 * w + x1], p10 = raw[y1 * w + x0], p11 = raw[y1 * w + x1];
      if (p00 < 0 && p01 < 0 && p10 < 0 && p11 < 0) { newRaw[y * nw + x] = -1; } 
      else { var sum = 0, count = 0; if (p00 >= 0) { sum += p00 * (1-tx) * (1-ty); count += (1-tx)*(1-ty); } if (p01 >= 0) { sum += p01 * tx * (1-ty); count += tx*(1-ty); } if (p10 >= 0) { sum += p10 * (1-tx) * ty; count += (1-tx)*ty; } if (p11 >= 0) { sum += p11 * tx * ty; count += tx*ty; } newRaw[y * nw + x] = count > 0 ? sum / count : -1; }
    } }
    return { data: newRaw, w: nw, h: nh };
  }

  function applySmoothing(raw, w, h, strength) { 
    if (strength === 0) return raw; 
    var size = strength * 2 + 1; var half = Math.floor(size / 2); var result = new Float32Array(raw.length); var kernel = []; var sigma = strength * 0.6 + 0.5; var sum = 0; 
    for (var i = -half; i <= half; i++) { for (var j = -half; j <= half; j++) { var d = Math.sqrt(i * i + j * j); var val = Math.exp(-(d * d) / (2 * sigma * sigma)); kernel.push(val); sum += val; } } 
    for (var ki = 0; ki < kernel.length; ki++) kernel[ki] /= sum; 
    var kw = size, kh = size; 
    for (var y = 0; y < h; y++) { for (var x = 0; x < w; x++) { var acc = 0, wsum = 0; for (var ky = -half; ky <= half; ky++) { for (var kx = -half; kx <= half; kx++) { var px = x + kx, py = y + ky; if (px < 0 || px >= w || py < 0 || py >= h) continue; var idx = py * w + px; if (raw[idx] >= 0) { var kidx = (ky + half) * kw + (kx + half); acc += raw[idx] * kernel[kidx]; wsum += kernel[kidx]; } } } var idx2 = y * w + x; result[idx2] = (wsum > 0) ? acc / wsum : -1; } } 
    return result; 
  }

  function processTile(img, px, smooth, smoothStrength) {
    var src = document.createElement('canvas'); src.width = src.height = 256; var sc = src.getContext('2d'); sc.drawImage(img, 0, 0);
    var id = sc.getImageData(0, 0, 256, 256), d = id.data; var w = 256, h = 256; var raw = new Float32Array(w * h);
    for (var i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) { var v = (d[i] + d[i + 1] + d[i + 2]) / 3 | 0; raw[i / 4] = v; } else { raw[i / 4] = -1; } }
    var targetRaw = raw, targetW = w, targetH = h;
    /* На мобильных пропускаем 2× интерполяцию (px<1): в 4 раза меньше вычислений, разница на экране телефона незаметна */
    if (px < 1 && !IS_MOBILE) { var scale = 1 / px; var interp = interpolateRaw(raw, w, h, scale); targetRaw = interp.data; targetW = interp.w; targetH = interp.h; }
    var smoothed = targetRaw;
    if (smooth && smoothStrength > 0) { smoothed = applySmoothing(targetRaw, targetW, targetH, smoothStrength); }
    var out = document.createElement('canvas'); out.width = targetW; out.height = targetH; var oc = out.getContext('2d'); oc.imageSmoothingEnabled = false;
    var effectivePx = (px < 1) ? 1 : px; var bw = Math.ceil(targetW / effectivePx), bh = Math.ceil(targetH / effectivePx);
    for (var py = 0; py < bh; py++) { for (var pxx = 0; pxx < bw; pxx++) {
      var x0 = pxx * effectivePx, y0 = py * effectivePx, x1 = Math.min(x0 + effectivePx, targetW), y1 = Math.min(y0 + effectivePx, targetH);
      var sum = 0, n = 0;
      for (var yy = y0; yy < y1; yy++) { for (var xx = x0; xx < x1; xx++) { var idx = yy * targetW + xx; if (smoothed[idx] >= 0) { sum += smoothed[idx]; n++; } } }
      if (n > 0) { var avg = Math.round(sum / n); var rgb = getColor(avg); if (rgb) { oc.fillStyle = 'rgb(' + rgb.join(',') + ')'; oc.fillRect(x0, y0, x1 - x0, y1 - y0); } }
    } }
    return { canvas: out, raw: smoothed, px: px, scaled: false };
  }

  function bumpLoad(d) { S.loadN = Math.max(0, S.loadN + d); $('pulse').classList.toggle('busy', S.loadN > 0 || satLoading); }

  /* ─── Очередь обработки тайлов: тяжёлые processTile выполняются порциями ≤8мс на кадр rAF,
     чтобы главный поток (и UI) не замирал при сглаживании/смене разрешения ─── */
  var procQueue = [], procScheduled = false;
  function drainProcQueue() {
    procScheduled = false;
    var t0 = performance.now();
    while (procQueue.length && (performance.now() - t0) < 8) {
      var job = procQueue.shift();
      if (job.run) { try { job.run(); } catch (e) {} continue; } /* универсальные задания (реколоризация спутника и т.п.) */
      if (S.ts !== job.sts || S.layer !== job.sl) continue; /* кадр уже неактуален */
      try {
        var result = processTile(job.img, job.spx, job.ssmooth, job.sstrength);
        if (S.cache.size >= S.cacheMax) S.cache.delete(S.cache.keys().next().value);
        S.cache.set(job.ck, result);
      } catch (e) { S.failed.add(job.ck); }
    }
    if (procQueue.length && !procScheduled) { procScheduled = true; requestAnimationFrame(drainProcQueue); }
    schedRender();
  }
  function enqueueTile(job) { procQueue.push(job); if (!procScheduled) { procScheduled = true; requestAnimationFrame(drainProcQueue); } }

  function fetchTile(x, y) {
    var ck = CK(x, y); if (S.cache.has(ck) || S.pending.has(ck) || S.failed.has(ck)) return;
    S.pending.add(ck); bumpLoad(1); var url = SRC + '/' + S.ts + '/' + FZ + '/' + x + '_' + y + '.png'; var img = new Image(); img.crossOrigin = 'anonymous';
    var spx = S.px, sl = S.layer, sts = S.ts, ssmooth = S.smooth, sstrength = S.smoothStrength;
    var tid = setTimeout(function() { S.pending.delete(ck); bumpLoad(-1); S.failed.add(ck); }, 8000);
    img.onload = function() { clearTimeout(tid); S.pending.delete(ck); bumpLoad(-1); if (S.ts !== sts || S.layer !== sl) return; enqueueTile({ img: img, ck: ck, spx: spx, sl: sl, sts: sts, ssmooth: ssmooth, sstrength: sstrength }); };
    img.onerror = function() { clearTimeout(tid); S.pending.delete(ck); bumpLoad(-1); S.failed.add(ck); };
    img.src = url;
  }

  var renderPend = false;
  function schedRender() { if (!renderPend) { renderPend = true; requestAnimationFrame(doRender); } }
  function doRender() {
    renderPend = false;
    /* DPR-масштаб: рисуем в CSS-пикселях, физически — в device-пикселях (чёткость на retina) */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (S.layer === 'sat') { satUpdateChip(); return; }
    /* Слой скрыт кнопкой-«глазом»: не тратим CPU на отрисовку */
    if (!S.dbzVisible) { setChip((S.layer === 'radar' ? 'dBZ' : 'ОЯ') + ' · слой скрыт'); return; }
    if (S.fade.active) { var elapsed = (performance.now() - S.fade.start) / S.fade.duration; if (elapsed >= 1) { S.fade.active = false; S.fade.alpha = 1; prevFrame.valid = false; } else { S.fade.alpha = Math.min(elapsed, 1); S.fade.alpha = 1 - Math.pow(1 - S.fade.alpha, 3); schedRender(); } }
    var alpha = S.fade.active ? S.fade.alpha : 1; var tiles = visTiles();
    /* Старый кадр гаснет под новым; снимок хранится в device-пикселях → рисуем с identity-матрицей */
    if (S.fade.active && prevFrame.valid) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 - alpha; ctx.drawImage(prevFrame.canvas, 0, 0); ctx.restore(); }
    ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
    var hit = 0, miss = 0;
    for (var i = 0; i < tiles.length; i++) { 
      var t = tiles[i], ck = CK(t.x, t.y), entry = S.cache.get(ck); 
      if (entry && entry.canvas) { var r = tileRect(t.x, t.y); if (r.sw > 0 && r.sh > 0) { ctx.drawImage(entry.canvas, r.sx, r.sy, r.sw, r.sh); hit++; } } else { fetchTile(t.x, t.y); miss++; } 
    }
    ctx.globalAlpha = 1;
    /* Статус-чип: слой · время кадра МСК · загрузка */
    var lname = S.layer === 'radar' ? 'dBZ' : 'ОЯ';
    var tstr = new Date(S.ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    var calMark = radarCalIsDefault() ? '' : ' · калибр. ' + (CAL.radar.dbzOffset > 0 ? '+' : '') + CAL.radar.dbzOffset + 'дБ' + (CAL.radar.dbzGain !== 1 ? '/' + CAL.radar.dbzGain + '×' : '');
    setChip(lname + ' · ' + tstr + ' МСК' + calMark + (miss > 0 ? ' · ⏳' + miss : ''));
    if (S.layer === 'wx') { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.beginPath(); for (var gi = 0; gi < tiles.length; gi++) { var gt = tiles[gi], gr = tileRect(gt.x, gt.y); if (gr.sw <= 0 || gr.sh <= 0) continue; var scX = gr.sw / 256, scY = gr.sh / 256, bW = S.px * scX, bH = S.px * scY; if (bW < 1 || bH < 1) continue; var cols = Math.ceil(256 / S.px); for (var ci = 0; ci <= cols; ci++) { var lx = gr.sx + Math.round(ci * bW) + 0.5; ctx.moveTo(lx, gr.sy); ctx.lineTo(lx, gr.sy + gr.sh); } for (var ri = 0; ri <= cols; ri++) { var ly = gr.sy + Math.round(ri * bH) + 0.5; ctx.moveTo(gr.sx, ly); ctx.lineTo(gr.sx + gr.sw, ly); } } ctx.stroke(); ctx.restore(); }
  }

  map.on('move', schedRender); map.on('movestart', function() { prevFrame.valid = false; }); map.on('moveend zoomend', function() { if (S.layer !== 'sat') S.failed.clear(); schedRender(); });
  function forceRefresh() {
    if (S.layer === 'sat') { satRecolorCache.clear(); satApplyTime(true); return; } /* смена палитры спутника → перекрасить тайлы */
    S.cache.clear(); S.failed.clear(); S.pending.clear(); S.loadN = 0; $('pulse').classList.remove('busy'); schedRender();
  }
  /* Вращение иконки ↻ — видимый статус обновления */
  function spinRefreshBtn() { var b = $('btn-refresh'); retrig(b, 'spinning'); setTimeout(function() { b.classList.remove('spinning'); }, 850); }
  function doRefresh() { 
    spinRefreshBtn();
    if (S.layer === 'sat') { 
      /* Пересоздаём слой с сохранением выбранного канала и времени кадра */
      satErrToastTs = 0;
      delete satAutoStretch[SAT_CHANNELS[satChIdx].id]; /* пересчитать авто-контраст на свежем кадре */
      satApplyTime(true);
      buildFrames(); updHUD();
      toast('Спутник обновлён'); 
      return; 
    }
    setTime(nowTs(), false); startFrameFade(); buildFrames(); updHUD(); forceRefresh(); toast('Обновлено'); 
  }
  function updHUD() { updThumb(); }
  /* Прогресс и thumb — через transform (scaleX/translateX), а не left/width: без layout-перерасчётов */
  function updThumb() { var f = S.frames; if (!f.length) return; var r = f[f.length - 1] - f[0], p = r === 0 ? 0 : Math.max(0, Math.min(1, (S.ts - f[0]) / r)); var tw = $('track').offsetWidth; $('tfill').style.transform = 'scaleX(' + p + ')'; $('tthumb').style.transform = 'translate(' + (p * tw) + 'px, -50%) translateX(-50%)'; }
  function buildFrames() {
    /* Работает для радара И спутника: сетка времени задаётся stepSec()/histSec() */
    var mx = nowTs(), from = mx - histSec(), frames = [];
    for (var t = from; t <= mx; t += stepSec()) frames.push(t);
    S.frames = frames;
    buildFramesUI();
  }
  function buildFramesUI() {
    var el = $('tlbls'); el.innerHTML = '';
    if (!S.frames.length) return;
    for (var i = 0; i < 5; i++) {
      var idx = Math.round(i / 4 * (S.frames.length - 1));
      if (idx >= S.frames.length) idx = S.frames.length - 1;
      var s = document.createElement('span');
      s.textContent = new Date(S.frames[idx] * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
      el.appendChild(s);
    }
    updThumb();
  }

  var drag = false, timeTooltip = $('time-tooltip');
  function tsFromX(cx) { var r = $('track').getBoundingClientRect(); var p = Math.max(0, Math.min(1, (cx - r.left) / r.width)); return S.frames[Math.round(p * (S.frames.length - 1))] || nowTs(); }
  function pctFromX(cx) { var r = $('track').getBoundingClientRect(); return Math.max(0, Math.min(1, (cx - r.left) / r.width)) * 100; }
  function formatTimeDiff(ts) { var now = nowTs(), diff = ts - now, ad = Math.abs(diff); if (ad < 60) return { text: 'сейчас', cls: 'now' }; var mins = Math.round(ad / 60), hours = Math.floor(mins / 60), rm = mins % 60, text = ''; if (hours > 0) { text = hours + 'ч'; if (rm > 0) text += ' ' + rm + 'м'; } else text = mins + 'м'; return diff < 0 ? { text: '−' + text + ' назад', cls: 'past' } : { text: '+' + text + ' вперёд', cls: 'future' }; }
  function showTimeTooltip(ts, pct) { var d = new Date(ts * 1000), ts2 = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Moscow' }), ds = d.toLocaleDateString('ru', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' }), di = formatTimeDiff(ts); timeTooltip.innerHTML = '<div class="tt-time">' + ts2 + '</div><div class="tt-date">' + ds + ' МСК</div><div class="tt-diff ' + di.cls + '">' + di.text + '</div>'; timeTooltip.style.left = pct + '%'; timeTooltip.classList.add('visible'); }
  function hideTimeTooltip() { timeTooltip.classList.remove('visible'); }
  $('track').addEventListener('pointerdown', function(e) { drag = true; this.classList.add('dragging'); var ts = tsFromX(e.clientX), pct = pctFromX(e.clientX); S.ts = ts; updHUD(); S.manualTime = true; schedRender(); showTimeTooltip(ts, pct); this.setPointerCapture(e.pointerId); });
  $('track').addEventListener('pointermove', function(e) { if (drag) { var ts = tsFromX(e.clientX), pct = pctFromX(e.clientX); S.ts = ts; updHUD(); schedRender(); showTimeTooltip(ts, pct); if (S.layer === 'sat') satApplyTime(); } });
  document.addEventListener('pointerup', function() { if (drag) { drag = false; $('track').classList.remove('dragging'); hideTimeTooltip(); if (S.layer === 'sat') { satApplyTime(true); } else { startFrameFade(); buildFrames(); S.failed.clear(); forceRefresh(); } } });
  $('track').addEventListener('mousemove', function(e) { if (!drag) showTimeTooltip(tsFromX(e.clientX), pctFromX(e.clientX)); });
  $('track').addEventListener('mouseleave', function() { if (!drag) hideTimeTooltip(); });

  /* Для спутника базовый интервал больше: каждый кадр — сетевые WMS-тайлы */
  function animMs() { return (S.layer === 'sat' ? 2000 : 900) / S.speeds[S.speedI]; }
  function togglePlay() { S.playing ? stopPlay() : startPlay(); }
  function startPlay() {
    buildFrames(); S.frameI = 0; 
    S.timer = setInterval(function() {
      S.frameI = (S.frameI + 1) % S.frames.length;
      startFrameFade(); /* crossfade между кадрами (для sat — no-op) */
      S.ts = S.frames[S.frameI];
      if (S.layer === 'sat') { satApplyTime(); } else { S.failed.clear(); schedRender(); }
      updHUD();
    }, animMs());
    S.playing = true; $('playbtn').innerHTML = '&#x25A0;'; retrig($('playbtn'), 'pop');
  }
  function stopPlay() { var was = S.playing; clearInterval(S.timer); S.timer = null; S.playing = false; $('playbtn').innerHTML = '&#x25B6;'; if (was) retrig($('playbtn'), 'pop'); }
  function cycleSpeed() { S.speedI = (S.speedI + 1) % S.speeds.length; var spd = $('spd'); spd.textContent = S.speeds[S.speedI] + '×'; spd.classList.toggle('on', S.speedI > 0); retrig(spd, 'bump'); if (S.playing) { stopPlay(); startPlay(); } }
  function shiftTs(d) {
    stopPlay();
    var n = Math.round((S.ts + d) / stepSec()) * stepSec(); var mn = minTs(), mx = nowTs();
    n = Math.max(mn, Math.min(n, mx)); if (n <= mn) toast('⚠️ Максимум ' + Math.round(histSec() / 60) + ' мин назад');
    if (S.layer === 'sat') { setTime(n, true); buildFrames(); updHUD(); satApplyTime(true); }
    else { startFrameFade(); setTime(n, true); buildFrames(); updHUD(); S.failed.clear(); forceRefresh(); }
    toast('⏱ ' + new Date(S.ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }));
  }
  
  function setLayer(newLayer) {
    if (!newLayer || newLayer === S.layer) return;
    S.layer = newLayer;
    document.querySelectorAll('#layers-dropdown .dd-item').forEach(function(item) { item.classList.toggle('active', item.dataset.layer === S.layer); });
    $('btn-layers-menu').textContent = 'Слои: ' + (S.layer === 'radar' ? 'dBZ' : (S.layer === 'wx' ? 'ОЯ' : 'Спутник'));

    stopPlay();
    /* Смена слоя всегда возвращает видимость dBZ — предсказуемо для пользователя */
    S.dbzVisible = true;
    if (S.layer === 'sat') {
      /* Спутник: канвас радара плавно гаснет, таймлайн ОСТАЁТСЯ (история WMS через time=) */
      fadeCanvas(false);
      /* Прозрачность спутника фиксирована 50%: запоминаем значение радара,
         слайдер показывает 50 и блокируется (как для скрытого dBZ) */
      radarOpacityMem = parseInt($('opacity-slider').value) || 100;
      $('opacity-slider').value = Math.round(SAT_OPACITY * 100);
      $('opacity-val').textContent = Math.round(SAT_OPACITY * 100) + '%';
      $('opacity-slider').disabled = true; $('opacity-control').classList.add('disabled');
      $('channel-wrapper').style.display = 'block';
      S.manualTime = false; S.ts = nowTs();
      buildFrames(); updHUD();
      satApplyTime(true);
      updateSatBackdrop(true); /* на light/scheme — тёмная подложка, иначе снимки сливаются с белой картой */
      map.invalidateSize();
      toast('Спутник EUMETSAT: ' + SAT_CHANNELS[satChIdx].label);
    } else {
      /* Возврат к радару: снимаем WMS-слои, канвас плавно проявляется */
      startFrameFade(); /* снимок старого слоя для crossfade (radar↔wx) */
      if (eumetsatLayer) { map.removeLayer(eumetsatLayer); eumetsatLayer = null; }
      if (satOldLayer) { if (map.hasLayer(satOldLayer)) map.removeLayer(satOldLayer); satOldLayer = null; }
      satLoading = false; $('pulse').classList.remove('busy');
      updateSatBackdrop(false); /* подложка нужна только в sat-режиме */
      $('channel-wrapper').style.display = 'none';
      /* Возвращаем прозрачность радара, какой была до входа в sat; слайдер снова активен
         (applyDbzUI ниже уточнит disabled-состояние по S.dbzVisible) */
      $('opacity-slider').value = radarOpacityMem;
      $('opacity-val').textContent = radarOpacityMem + '%';
      $('opacity-slider').disabled = false; $('opacity-control').classList.remove('disabled');
      fadeCanvas(true); /* использует значение слайдера — восстановить ДО вызова */
      S.manualTime = false; S.ts = nowTs();
      S.pxIndex = 1; S.px = S.pxLevels[S.pxIndex]; updatePxLabel();
      S.cache.clear(); S.pending.clear(); S.failed.clear();
      buildFrames(); forceRefresh();
    }
    applyDbzUI();
    buildLegend(); hidePopup();
    if (S.ruler.active) toggleRuler();
    saveViewDebounced();
  }

  /* ─── Выбор канала спутника ─── */
  function setSatChannel(idx) {
    if (idx < 0 || idx >= SAT_CHANNELS.length || idx === satChIdx) { $('channel-dropdown').classList.remove('visible'); return; }
    satChIdx = idx;
    delete satAutoStretch[SAT_CHANNELS[idx].id]; /* авто-контраст пересчитается по новому каналу */
    try { localStorage.setItem('satChannel', SAT_CHANNELS[idx].id); } catch (e) {}
    var ch = SAT_CHANNELS[idx];
    $('btn-channel').textContent = 'Канал: ' + ch.label;
    document.querySelectorAll('#channel-dropdown .dd-item').forEach(function(item, i) { item.classList.toggle('active', i === idx); });
    $('channel-dropdown').classList.remove('visible');
    /* Подсказка для дневных каналов ночью (грубая оценка: 03–17 UTC ≈ светлое время для зоны MSG) */
    var utcH = new Date().getUTCHours();
    if (ch.day && (utcH < 3 || utcH > 17)) toast('☀️ Канал «' + ch.label + '» информативен только днём');
    buildLegend();
    satApplyTime(true);
    satUpdateChip();
    saveViewDebounced();
  }
  function initChannelUI() {
    var dd = $('channel-dropdown');
    SAT_CHANNELS.forEach(function(ch, i) {
      var item = document.createElement('div');
      item.className = 'dd-item' + (i === satChIdx ? ' active' : '');
      item.setAttribute('tabindex', '0'); item.setAttribute('role', 'button');
      item.textContent = ch.label + (ch.day ? ' ☀️' : '');
      item.addEventListener('click', function() { setSatChannel(i); });
      item.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSatChannel(i); $('btn-channel').focus(); } });
      dd.appendChild(item);
    });
    $('btn-channel').textContent = 'Канал: ' + SAT_CHANNELS[satChIdx].label;
    $('btn-channel').addEventListener('click', function(e) { e.stopPropagation(); dd.classList.toggle('visible'); });
    document.addEventListener('click', function(e) { if (!$('channel-wrapper').contains(e.target)) dd.classList.remove('visible'); });
  }
  initChannelUI();

  function cyclePx() { if (S.layer === 'sat') return; S.pxIndex = (S.pxIndex + 1) % S.pxLevels.length; S.px = S.pxLevels[S.pxIndex]; updatePxLabel(); S.cache.clear(); S.pending.clear(); S.failed.clear(); forceRefresh(); var resKm = (S.px * BASE_RES_KM).toFixed(1); toast('Разрешение: ' + resKm + ' км/пиксель'); schedRender(); saveViewDebounced(); }
  function updatePxLabel() { var resKm = (S.px * BASE_RES_KM); var label = resKm.toFixed(1) + ' км'; if (resKm === 1) label = '1x1 км'; if (resKm === 2) label = '2x2 км'; if (resKm === 4) label = '4x4 км'; if (resKm === 8) label = '8x8 км'; $('pxbtn').textContent = label; }
  /* Текст кнопок не меняем на «✓» — активность показывает состояние .on (без прыжков ширины) */
  function toggleSmooth() { if (S.layer === 'sat') return; S.smooth = !S.smooth; var btn = $('btn-smooth'); var ctrl = $('smooth-control'); if (S.smooth) { btn.classList.add('on'); ctrl.classList.add('active'); } else { btn.classList.remove('on'); ctrl.classList.remove('active'); } S.cache.clear(); S.pending.clear(); S.failed.clear(); forceRefresh(); toast(S.smooth ? 'Сглаживание включено (сила ' + S.smoothStrength + ')' : 'Сглаживание выключено'); saveViewDebounced(); }

  function toggleRuler() { S.ruler.active = !S.ruler.active; var btn = $('btn-ruler'); if (S.ruler.active) { btn.classList.add('on'); toast('Клик — точка, двойной клик — завершить.'); map.on('click', rulerClick); map.on('dblclick', rulerFinish); if (crosshairMode) toggleCrosshair(); } else { btn.classList.remove('on'); map.off('click', rulerClick); map.off('dblclick', rulerFinish); clearRuler(); } }
  function rulerClick(e) { if (!S.ruler.active) return; var latlng = e.latlng; S.ruler.points.push(latlng); var marker = L.circleMarker(latlng, { radius: 5, color: '#5b8def', fillColor: '#fff', fillOpacity: 1, weight: 2, className: 'ruler-marker' }).addTo(map); S.ruler.markers.push(marker); updateRulerLine(); updateRulerLabels(); }
  function updateRulerLine() { if (S.ruler.polyline) { map.removeLayer(S.ruler.polyline); S.ruler.polyline = null; } if (S.ruler.points.length >= 2) { S.ruler.polyline = L.polyline(S.ruler.points, { color: '#5b8def', weight: 2, dashArray: '6 4', opacity: 0.8, className: 'ruler-line' }).addTo(map); } }
  function updateRulerLabels() { S.ruler.segmentLabels.forEach(function(l) { map.removeLayer(l); }); S.ruler.segmentLabels = []; if (S.ruler.label) { map.removeLayer(S.ruler.label); S.ruler.label = null; } if (S.ruler.points.length < 2) return; var totalDist = 0; for (var i = 1; i < S.ruler.points.length; i++) { totalDist += S.ruler.points[i - 1].distanceTo(S.ruler.points[i]); } var distKm = (totalDist / 1000).toFixed(1); var midIdx = Math.floor((S.ruler.points.length - 1) / 2); var midLatLng = S.ruler.points[midIdx]; var labelHtml = '<div class="ruler-label">📏 ' + distKm + ' км</div>'; S.ruler.label = L.marker(midLatLng, { icon: L.divIcon({ className: '', html: labelHtml, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map); for (var j = 1; j < S.ruler.points.length; j++) { var p1 = S.ruler.points[j - 1], p2 = S.ruler.points[j]; var segDist = (p1.distanceTo(p2) / 1000).toFixed(1); var midSeg = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2); var segLabel = L.marker(midSeg, { icon: L.divIcon({ className: '', html: '<div class="ruler-segment-label">' + segDist + ' км</div>', iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map); S.ruler.segmentLabels.push(segLabel); } }
  function clearRuler() { S.ruler.points = []; if (S.ruler.polyline) { map.removeLayer(S.ruler.polyline); S.ruler.polyline = null; } if (S.ruler.label) { map.removeLayer(S.ruler.label); S.ruler.label = null; } S.ruler.segmentLabels.forEach(function(l) { map.removeLayer(l); }); S.ruler.segmentLabels = []; S.ruler.markers.forEach(function(m) { map.removeLayer(m); }); S.ruler.markers = []; }
  function rulerFinish(e) { if (!S.ruler.active) return; if (S.ruler.points.length < 2) { toast('Нужно минимум 2 точки'); } else { var total = 0; for (var i = 1; i < S.ruler.points.length; i++) { total += S.ruler.points[i - 1].distanceTo(S.ruler.points[i]); } toast('📏 Длина: ' + (total / 1000).toFixed(1) + ' км'); } toggleRuler(); }

  function setLegendTitle(t) { var el = $('ltitle'); if (el.textContent !== t) { el.textContent = t; retrig(el, 'title-swap'); } }
  function buildLegend() { 
    var el = $('lbody'); el.innerHTML = ''; 
    if (S.layer === 'sat') {
      var ch = SAT_CHANNELS[satChIdx];
      setLegendTitle('СПУТНИК · ' + ch.label.toUpperCase());
      var idx = 0;
      var pal = satActivePalette();
      if (pal && pal.items && pal.items.length && !pal.legendOnly) {
        /* Легенда из активной палитры канала: градиент по стопам (v по возрастанию) + строки */
        var asc = pal.items.slice().sort(function(a, b) { return a.v - b.v; });
        var g = document.createElement('div'); g.className = 'lgrad li';
        g.style.background = 'linear-gradient(to right, ' + asc.map(function(it) { return 'rgb(' + it.r.join(',') + ')'; }).join(', ') + ')';
        g.style.setProperty('--i', idx++);
        el.appendChild(g);
        var cap = document.createElement('div'); cap.className = 'li lgrad-cap'; cap.style.setProperty('--i', idx++);
        cap.innerHTML = '<span>тепло</span><span>холодно</span>';
        el.appendChild(cap);
        pal.items.forEach(function(it) {
          var row = document.createElement('div'); row.className = 'li'; row.style.setProperty('--i', Math.min(idx++, 14));
          var sq = document.createElement('div'); sq.className = 'lsq'; sq.style.background = 'rgb(' + it.r.join(',') + ')';
          var t = document.createElement('span'); t.textContent = it.l;
          row.appendChild(sq); row.appendChild(t); el.appendChild(row);
        });
        if (pal.noRecolor) { var nr = document.createElement('div'); nr.className = 'li legend-note'; nr.style.setProperty('--i', Math.min(idx++, 14)); nr.textContent = 'Оригинальные тона канала'; el.appendChild(nr); }
      } else {
        /* Fallback: стандартная легенда канала (RGB-каналы и т.п.) */
        var lg = ch.legend || {};
        if (lg.grad) {
          var g2 = document.createElement('div'); g2.className = 'lgrad li';
          g2.style.background = 'linear-gradient(to right, ' + lg.grad.join(', ') + ')';
          g2.style.setProperty('--i', idx++);
          el.appendChild(g2);
          var cap2 = document.createElement('div'); cap2.className = 'li lgrad-cap'; cap2.style.setProperty('--i', idx++);
          cap2.innerHTML = '<span>холодно</span><span>тепло</span>';
          el.appendChild(cap2);
        }
        (lg.rows || []).forEach(function(r) {
          var row = document.createElement('div'); row.className = 'li'; row.style.setProperty('--i', Math.min(idx++, 14));
          var sq = document.createElement('div'); sq.className = 'lsq'; sq.style.background = r[0];
          var t = document.createElement('span'); t.textContent = r[1];
          row.appendChild(sq); row.appendChild(t); el.appendChild(row);
        });
      }
      if (ch.day) { var d = document.createElement('div'); d.className = 'li legend-note'; d.style.setProperty('--i', Math.min(idx++, 14)); d.textContent = '☀️ Канал информативен только днём'; el.appendChild(d); }
      var opn = document.createElement('div'); opn.className = 'li legend-note'; opn.style.setProperty('--i', Math.min(idx++, 14)); opn.textContent = 'Прозрачность слоя: 50%'; el.appendChild(opn);
      /* Обязательная атрибуция по лицензии EUMETSAT */
      var attr = document.createElement('div'); attr.className = 'li legend-note'; attr.style.setProperty('--i', Math.min(idx++, 14)); attr.textContent = '© EUMETSAT'; el.appendChild(attr);
      if (ch.gray) buildCalSection(el, 'sat'); /* калибровка яркости — только для grayscale-каналов */
      return;
    }
    var items = getCurrentPaletteItems(); var title = S.layer === 'radar' ? 'ОТРАЖАЕМОСТЬ dBZ' : 'ПОГОДНЫЕ ЯВЛЕНИЯ'; setLegendTitle(title); 
    items.forEach(function(p, i) { var row = document.createElement('div'); row.className = 'li'; row.style.setProperty('--i', Math.min(i, 14)); var sq = document.createElement('div'); sq.className = 'lsq'; sq.style.background = 'rgb(' + p.r + ')'; if (!p.r[0] && !p.r[1] && !p.r[2]) sq.style.border = '1px solid #555'; var t = document.createElement('span'); t.textContent = p.l; row.appendChild(sq); row.appendChild(t); el.appendChild(row); }); 
    buildCalSection(el, 'radar');
  }

  /* ─── UI калибровки в легенде: секция живёт в контексте слоя, результат виден сразу.
     Слайдеры применяются с дебаунсом 180мс (сброс кэшей → перерисовка через существующие пути) ─── */
  var calOpen = false, calApplyTmr = null;
  function calApplyDebounced() {
    clearTimeout(calApplyTmr);
    calApplyTmr = setTimeout(function() {
      saveCalibration();
      /* forceRefresh: для радара чистит S.cache (цвета впечатаны в тайлы),
         для спутника — satRecolorCache + пересоздание слоя */
      forceRefresh();
      schedRender();
    }, 180);
  }
  function calSlider(parent, label, min, max, step, val, onInput) {
    var row = document.createElement('div'); row.className = 'cal-row';
    var lab = document.createElement('label'); lab.textContent = label;
    var inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
    var out = document.createElement('span'); out.className = 'cal-val'; out.textContent = val;
    inp.addEventListener('input', function() { out.textContent = this.value; retrig(out, 'bump'); onInput(parseFloat(this.value)); calApplyDebounced(); });
    row.appendChild(lab); row.appendChild(inp); row.appendChild(out);
    parent.appendChild(row);
    return inp;
  }
  function buildCalSection(el, kind) {
    var wrap = document.createElement('div'); wrap.className = 'cal-section';
    var head = document.createElement('button'); head.className = 'cal-head'; head.type = 'button';
    head.setAttribute('aria-expanded', calOpen ? 'true' : 'false');
    head.textContent = '⚙ Калибровка' + ((kind === 'radar' && !radarCalIsDefault()) || (kind === 'sat' && !CAL.sat.auto) ? ' •' : '');
    var body = document.createElement('div'); body.className = 'cal-body' + (calOpen ? ' open' : '');
    head.addEventListener('click', function() { calOpen = !calOpen; body.classList.toggle('open', calOpen); head.setAttribute('aria-expanded', calOpen ? 'true' : 'false'); });
    if (kind === 'sat') {
      var note = document.createElement('div'); note.className = 'cal-note';
      note.textContent = CAL.sat.auto ? 'Авто-контраст (перцентили 2–98)' : 'Ручной режим';
      body.appendChild(note);
      /* Ручные слайдеры: движение отключает авто */
      calSlider(body, 'Яркость', -100, 100, 5, CAL.sat.offset, function(v) { CAL.sat.auto = false; CAL.sat.offset = v; note.textContent = 'Ручной режим'; });
      calSlider(body, 'Контраст', 0.5, 2, 0.05, CAL.sat.gain, function(v) { CAL.sat.auto = false; CAL.sat.gain = v; note.textContent = 'Ручной режим'; });
      calSlider(body, 'Гамма', 0.4, 2.5, 0.05, CAL.sat.gamma, function(v) { CAL.sat.auto = false; CAL.sat.gamma = v; note.textContent = 'Ручной режим'; });
      var btns = document.createElement('div'); btns.className = 'cal-btns';
      var bAuto = document.createElement('button'); bAuto.className = 'btn'; bAuto.textContent = 'Авто';
      bAuto.addEventListener('click', function() { CAL.sat.auto = true; delete satAutoStretch[SAT_CHANNELS[satChIdx].id]; buildLegend(); calApplyDebounced(); });
      var bReset = document.createElement('button'); bReset.className = 'btn'; bReset.textContent = 'Сброс';
      bReset.addEventListener('click', function() { CAL.sat = { offset: 0, gain: 1, gamma: 1, auto: true }; delete satAutoStretch[SAT_CHANNELS[satChIdx].id]; buildLegend(); calApplyDebounced(); });
      btns.appendChild(bAuto); btns.appendChild(bReset); body.appendChild(btns);
    } else {
      /* Радар: авто-калибровку намеренно НЕ делаем — молча искажать метеоданные нельзя;
         только ручная подстройка с пометкой в статус-чипе */
      calSlider(body, 'Сдвиг dBZ', -10, 10, 1, CAL.radar.dbzOffset, function(v) { CAL.radar.dbzOffset = v; });
      calSlider(body, 'Масштаб', 0.8, 1.2, 0.05, CAL.radar.dbzGain, function(v) { CAL.radar.dbzGain = v; });
      var btns2 = document.createElement('div'); btns2.className = 'cal-btns';
      var bReset2 = document.createElement('button'); bReset2.className = 'btn'; bReset2.textContent = 'Сброс';
      bReset2.addEventListener('click', function() { CAL.radar = { dbzOffset: 0, dbzGain: 1 }; buildLegend(); calApplyDebounced(); });
      btns2.appendChild(bReset2); body.appendChild(btns2);
    }
    wrap.appendChild(head); wrap.appendChild(body); el.appendChild(wrap);
  }
  function toggleLegend() { var lg = $('legend'), btn = $('toggle-legend-btn'); if (S.legendVis) { lg.classList.add('collapsed'); btn.innerHTML = '+'; } else { lg.classList.remove('collapsed'); btn.innerHTML = '−'; } S.legendVis = !S.legendVis; saveViewDebounced(); }
  /* ─── Toast: отдельный элемент снизу по центру, fade+slide, очередь сообщений.
     Сигнатура toast(m) сохранена — все существующие вызовы работают ─── */
  var toastEl = document.createElement('div');
  toastEl.id = 'toast'; toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  var toastQueue = [], toastActive = false;
  function toast(m) {
    toastQueue.push(m);
    if (toastQueue.length > 3) toastQueue = toastQueue.slice(-3); /* не копим лавину */
    if (!toastActive) nextToast();
  }
  function nextToast() {
    if (!toastQueue.length) { toastActive = false; return; }
    toastActive = true;
    toastEl.textContent = toastQueue.shift();
    toastEl.classList.add('show');
    setTimeout(function() {
      toastEl.classList.remove('show');
      setTimeout(nextToast, REDUCE_MOTION ? 30 : 220); /* дождаться fade-out */
    }, 2500);
  }

  /* Авто-подтяжка данных: радар — каждую минуту; спутник — при появлении нового 15-мин кадра */
  setInterval(function() {
    if (S.playing || S.manualTime) { if (S.layer !== 'sat') buildFrames(); return; }
    var n = nowTs();
    if (n !== S.ts) {
      S.ts = n; updHUD();
      if (S.layer === 'sat') { satApplyTime(true); buildFrames(); toast('Новый снимок спутника'); }
      else { forceRefresh(); toast('Новые данные'); }
    }
    buildFrames();
  }, 60000);

  var hoverEl = $('hover-indicator'), popupEl = $('pixel-popup'), crosshairEl = $('crosshair'), crosshairLbl = $('crosshair-label');
  var popupVisible = false, crosshairMode = false;
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function findPalEntry(r, g, b) { var items = getCurrentPaletteItems(), best = null, bd = 1e9; for (var i = 0; i < items.length; i++) { var p = items[i], dr = r - p.r[0], dg = g - p.r[1], db = b - p.r[2], d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = p; } } return bd < 3000 ? { label: best.l, v: best.v } : null; }
  
  function getBlockAt(mx, my) { 
    if (S.layer === 'sat' || !S.dbzVisible) return null; /* скрытый dBZ — как sat: без прицела/попапа */
    var tiles = visTiles(); 
    for (var i = 0; i < tiles.length; i++) { 
      var t = tiles[i], r = tileRect(t.x, t.y); 
      if (r.sw <= 0 || r.sh <= 0 || mx < r.sx || mx >= r.sx + r.sw || my < r.sy || my >= r.sy + r.sh) continue; 
      var ck = CK(t.x, t.y), entry = S.cache.get(ck); 
      if (!entry || !entry.canvas) return null; 
      var targetSize = entry.canvas.width; var effectivePx = (S.px < 1) ? 1 : S.px; 
      var oxF = Math.max(0, Math.min(targetSize - 0.1, (mx - r.sx) / r.sw * targetSize)); 
      var oyF = Math.max(0, Math.min(targetSize - 0.1, (my - r.sy) / r.sh * targetSize)); 
      var bx = Math.floor(oxF / effectivePx) * effectivePx; var by = Math.floor(oyF / effectivePx) * effectivePx; 
      var bx2 = Math.min(bx + effectivePx, targetSize); var by2 = Math.min(by + effectivePx, targetSize); 
      var cx2 = (bx + bx2) / 2 | 0; var cy2 = (by + by2) / 2 | 0; 
      try { 
        var pd = entry.canvas.getContext('2d').getImageData(cx2, cy2, 1, 1).data; 
        if (!pd[3]) return null; 
        var scX = r.sw / targetSize; var scY = r.sh / targetSize; var dbz = -1; 
        if (entry.raw && entry.raw.length > 0) { var ix = Math.round(cx2); var iy = Math.round(cy2); if (ix >= 0 && ix < targetSize && iy >= 0 && iy < targetSize) { var rawIdx = iy * targetSize + ix; if (rawIdx < entry.raw.length) { dbz = entry.raw[rawIdx]; if (dbz >= 0) dbz = calDbz(dbz); } } } 
        return { sx: r.sx + Math.round(bx * scX), sy: r.sy + Math.round(by * scY), sw: Math.max(4, Math.round(effectivePx * scX)), sh: Math.max(4, Math.round(effectivePx * scY)), color: 'rgb(' + pd[0] + ',' + pd[1] + ',' + pd[2] + ')', r: pd[0], g: pd[1], b: pd[2], info: findPalEntry(pd[0], pd[1], pd[2]), dbz: dbz }; 
      } catch (e) { return null; } 
    } 
    return null; 
  }
  
  function updateCrosshair() { if (!crosshairMode || S.layer === 'sat') return; var cx = innerWidth / 2, cy = innerHeight / 2, block = getBlockAt(cx, cy); if (block) { hoverEl.style.display = 'block'; hoverEl.style.left = block.sx + 'px'; hoverEl.style.top = block.sy + 'px'; hoverEl.style.width = block.sw + 'px'; hoverEl.style.height = block.sh + 'px'; hoverEl.style.background = 'transparent'; var info = block.info; var txt = '—'; if (info) { if (S.layer === 'radar') { if (block.dbz >= 0) { txt = Math.round(block.dbz) + ' dBZ | ' + info.label; } else { txt = '≥' + info.v + ' dBZ | ' + info.label; } } else { txt = info.label; } } crosshairLbl.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + block.color + ';border:1px solid #000;vertical-align:middle;margin-right:6px"></span>' + txt; crosshairLbl.style.display = 'block'; var lw = crosshairLbl.offsetWidth || 200, lh = crosshairLbl.offsetHeight || 36, lx = cx - lw / 2, ly = cy - 50 - lh; if (ly < 8) ly = cy + 50; crosshairLbl.style.left = lx + 'px'; crosshairLbl.style.top = ly + 'px'; } else { hoverEl.style.display = 'none'; crosshairLbl.innerHTML = '<span style="color:#888">нет данных</span>'; crosshairLbl.style.display = 'block'; crosshairLbl.style.left = (innerWidth / 2 - (crosshairLbl.offsetWidth || 120) / 2) + 'px'; crosshairLbl.style.top = (innerHeight / 2 - 60) + 'px'; } }
  function toggleCrosshair() { crosshairMode = !crosshairMode; var btn = $('btn-crosshair'); if (crosshairMode) { btn.classList.add('on'); crosshairEl.style.display = 'block'; updateCrosshair(); } else { btn.classList.remove('on'); crosshairEl.style.display = 'none'; crosshairLbl.style.display = 'none'; hoverEl.style.display = 'none'; } if (S.ruler.active) toggleRuler(); }
  function showPopup(block, mx, my) { var info = block.info; var lbl = info ? escHtml(info.label) : '—'; var meta = ''; if (info) { if (S.layer === 'radar') { if (block.dbz >= 0) { meta = 'Слой: <b>Отражаемость</b><br>Значение: <b>' + Math.round(block.dbz) + '</b> dBZ<br>Категория: ' + info.label; } else { meta = 'Слой: <b>Отражаемость</b><br>Порог: ≥' + info.v + ' dBZ<br>Категория: ' + info.label; } } else { meta = 'Слой: <b>Явления</b><br>' + info.label; } } else { meta = 'Нет данных'; } popupEl.innerHTML = '<div class="popup-header"><div class="popup-swatch" style="background:' + block.color + '"></div><div class="popup-label">' + lbl + '</div></div><div class="popup-meta">' + meta + '</div><span class="popup-close" onclick="document.getElementById(\'pixel-popup\').style.display=\'none\'">✕</span>'; popupEl.style.display = 'block'; popupEl.classList.remove('popup-in'); void popupEl.offsetWidth; popupEl.classList.add('popup-in'); var px2 = mx + 16, py2 = my - 55; if (px2 + 230 > innerWidth - 8) px2 = mx - 246; if (py2 < 8) py2 = 8; if (py2 + 110 > innerHeight - 8) py2 = innerHeight - 118; popupEl.style.left = px2 + 'px'; popupEl.style.top = py2 + 'px'; popupVisible = true; }
  function hidePopup() { popupEl.style.display = 'none'; popupVisible = false; }
  map.on('mousemove', function(e) { if (crosshairMode) { requestAnimationFrame(updateCrosshair); return; } if (S.layer === 'sat') return; var p = e.containerPoint, block = getBlockAt(p.x, p.y); if (block) { hoverEl.style.display = 'block'; hoverEl.style.left = block.sx + 'px'; hoverEl.style.top = block.sy + 'px'; hoverEl.style.width = block.sw + 'px'; hoverEl.style.height = block.sh + 'px'; hoverEl.style.background = block.color; } else hoverEl.style.display = 'none'; });
  map.on('click', function(e) { if (S.ruler.active || S.layer === 'sat') return; var p = crosshairMode ? { x: innerWidth / 2, y: innerHeight / 2 } : e.containerPoint, block = getBlockAt(p.x, p.y); block ? showPopup(block, p.x, p.y) : hidePopup(); });

  var modal = $('palette-modal'), modalClose = $('modal-close'), modalTabs = document.querySelectorAll('.modal-tabs button'), paletteListContainer = $('palette-list-container'), loadPaletteBtn = $('load-palette-btn'), fileInput = $('file-input'), createPaletteBtn = $('create-palette-btn'), deletePaletteBtn = $('delete-palette-btn'), exportPaletteBtn = $('export-palette-btn'), createForm = $('create-form'), newPalName = $('new-pal-name'), entryVal = $('entry-val'), entryColor = $('entry-color'), entryLabel = $('entry-label'), addEntryBtn = $('add-entry-btn'), entriesList = $('entries-list'), savePaletteBtn = $('save-palette-btn'), cancelCreateBtn = $('cancel-create-btn');
  var currentLayerForModal = 'radar'; var tempEntries = []; var editingIndex = -1; var editingEntryIndex = -1;
  /* a11y: фокус уходит в модалку при открытии и возвращается на вызвавшую кнопку при закрытии */
  var lastFocused = null;
  function focusModal(m) { var mc = m.querySelector('.modal-content'); if (mc) { mc.setAttribute('tabindex', '-1'); mc.focus({ preventScroll: true }); } }
  function restoreFocus() { if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus(); lastFocused = null; }
  /* ─── UI спутниковых палитр в модалке: селект канала + подсказка для RGB-каналов ─── */
  var satPalChSelect = $('sat-pal-ch'), satPalChRow = $('sat-pal-ch-row'), satPalNote = $('sat-pal-note');
  if (satPalChSelect) {
    SAT_CHANNELS.forEach(function(ch) {
      var opt = document.createElement('option');
      opt.value = ch.id; opt.textContent = ch.label + (ch.gray ? '' : ' (цветной)');
      satPalChSelect.appendChild(opt);
    });
    satPalChSelect.addEventListener('change', function() { satModalChId = this.value; syncSatPalUI(); renderPaletteList(); closeForm(); });
  }
  function syncSatPalUI() {
    if (!satPalChRow) return;
    var isSat = currentLayerForModal === 'sat';
    satPalChRow.style.display = isSat ? 'block' : 'none';
    /* Подпись поля порога: для спутника — яркость 0–255, для радара/ОЯ — дБZ */
    if (entryVal) entryVal.placeholder = isSat ? '0–255' : 'дБZ';
    if (!isSat) return;
    if (satPalChSelect.value !== satModalChId) satPalChSelect.value = satModalChId;
    var ch = null;
    for (var i = 0; i < SAT_CHANNELS.length; i++) if (SAT_CHANNELS[i].id === satModalChId) { ch = SAT_CHANNELS[i]; break; }
    satPalNote.textContent = (ch && !ch.gray)
      ? 'Канал уже цветной — палитра применяется только к легенде'
      : 'Порог = яркость пикселя 0–255 (255 — самое холодное/яркое)';
  }
  function openModal() { lastFocused = document.activeElement; modal.classList.add('open'); focusModal(modal); currentLayerForModal = S.layer; satModalChId = SAT_CHANNELS[satChIdx].id; syncSatPalUI(); modalTabs.forEach(function(btn) { btn.classList.toggle('active', btn.dataset.layer === currentLayerForModal); }); renderPaletteList(); closeForm(); editingIndex = -1; editingEntryIndex = -1; tempEntries = []; renderEntries(); }
  function closeModal() { modal.classList.remove('open'); closeForm(); restoreFocus(); }
  function renderPaletteList() { var list = palettes[currentLayerForModal].list; var activeIdx = palettes[currentLayerForModal].activeIdx; var html = ''; list.forEach(function(p, idx) { var activeClass = idx === activeIdx ? 'active' : ''; var builtinBadge = p.builtin ? '<span class="badge">встроенная</span>' : ''; var editBtn = p.builtin ? '' : '<button class="edit-btn" data-idx="' + idx + '" title="Редактировать">✎</button>'; html += '<div class="palette-item ' + activeClass + '" data-idx="' + idx + '">' + '<span class="name">' + escHtml(p.name) + ' ' + builtinBadge + '</span>' + '<div>' + editBtn + (p.builtin ? '' : '<button class="del" data-idx="' + idx + '" title="Удалить">✕</button>') + '</div></div>'; }); paletteListContainer.innerHTML = html; paletteListContainer.querySelectorAll('.palette-item').forEach(function(el) { el.addEventListener('click', function(e) { if (e.target.classList.contains('del') || e.target.classList.contains('edit-btn')) return; var idx = parseInt(this.dataset.idx); palettes[currentLayerForModal].activeIdx = idx; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } }); }); paletteListContainer.querySelectorAll('.edit-btn').forEach(function(btn) { btn.addEventListener('click', function(e) { e.stopPropagation(); var idx = parseInt(this.dataset.idx); startEditingPalette(idx); }); }); paletteListContainer.querySelectorAll('.del').forEach(function(btn) { btn.addEventListener('click', function(e) { e.stopPropagation(); var idx = parseInt(this.dataset.idx); var list2 = palettes[currentLayerForModal].list; if (list2[idx].builtin) return; if (confirm('Удалить палитру "' + list2[idx].name + '"?')) { list2.splice(idx, 1); if (palettes[currentLayerForModal].activeIdx >= list2.length) palettes[currentLayerForModal].activeIdx = list2.length - 1; if (palettes[currentLayerForModal].activeIdx < 0) palettes[currentLayerForModal].activeIdx = 0; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } } }); }); }
  function startEditingPalette(idx) { var list = palettes[currentLayerForModal].list; if (idx < 0 || idx >= list.length) return; var pal = list[idx]; if (pal.builtin) { toast('Встроенную палитру нельзя редактировать'); return; } editingIndex = idx; newPalName.value = pal.name; tempEntries = pal.items.map(function(item) { return { val: item.v, color: '#' + item.r.map(function(c) { return c.toString(16).padStart(2, '0'); }).join(''), label: item.l, r: { r: item.r[0], g: item.r[1], b: item.r[2] } }; }); editingEntryIndex = -1; renderEntries(); createForm.classList.add('open'); savePaletteBtn.textContent = '💾 Обновить'; toast('Редактирование палитры "' + pal.name + '"'); }
  function closeForm() { createForm.classList.remove('open'); editingIndex = -1; editingEntryIndex = -1; tempEntries = []; renderEntries(); savePaletteBtn.textContent = '💾 Сохранить'; newPalName.value = 'Новая палитра'; entryVal.value = '0'; entryColor.value = '#00aaff'; entryLabel.value = 'Осадки'; }
  function renderEntries() { entriesList.innerHTML = ''; tempEntries.forEach(function(e, idx) { var div = document.createElement('div'); div.className = 'entry'; if (editingEntryIndex === idx) { div.innerHTML = `<input type="number" class="edit-val" value="${e.val}" step="1" style="width:50px;background:#121212;border:1px solid #333;border-radius:4px;color:#fff;padding:2px;"><input type="color" class="edit-color" value="${e.color}" style="width:28px;height:28px;padding:0;border:0;background:transparent;cursor:pointer;"><input type="text" class="edit-label" value="${escHtml(e.label)}" style="flex:1;background:#121212;border:1px solid #333;border-radius:4px;color:#fff;padding:2px;"><button class="save-entry-btn" data-idx="${idx}" style="background:#4a7fe8;border:none;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:600;">✓</button>`; } else { div.innerHTML = `<span><span class="color-swatch" style="background:${e.color}"></span> ${e.val} → ${escHtml(e.label)}</span><div><button class="edit-entry-btn" data-idx="${idx}" style="background:none;border:none;color:#888;cursor:pointer;font-size:12px;margin-right:4px;">✎</button><button class="del-entry" data-idx="${idx}" style="background:none;border:none;color:#ff5252;cursor:pointer;font-size:12px;">✕</button></div>`; } entriesList.appendChild(div); }); entriesList.querySelectorAll('.save-entry-btn').forEach(function(btn) { btn.addEventListener('click', function() { var idx = parseInt(this.dataset.idx); var entryDiv = this.closest('.entry'); var valInput = entryDiv.querySelector('.edit-val'); var colorInput = entryDiv.querySelector('.edit-color'); var labelInput = entryDiv.querySelector('.edit-label'); var newVal = parseFloat(valInput.value); if (isNaN(newVal)) { toast('Введите число'); return; } var newColor = colorInput.value; var newLabel = labelInput.value.trim() || 'без метки'; var rgb = hexToRgb(newColor); if (!rgb) { toast('Неверный цвет'); return; } tempEntries[idx] = { val: newVal, color: newColor, label: newLabel, r: rgb }; editingEntryIndex = -1; renderEntries(); }); }); entriesList.querySelectorAll('.edit-entry-btn').forEach(function(btn) { btn.addEventListener('click', function() { var idx = parseInt(this.dataset.idx); editingEntryIndex = idx; renderEntries(); }); }); entriesList.querySelectorAll('.del-entry').forEach(function(btn) { btn.addEventListener('click', function() { var idx = parseInt(this.dataset.idx); tempEntries.splice(idx, 1); if (editingEntryIndex === idx) editingEntryIndex = -1; else if (editingEntryIndex > idx) editingEntryIndex--; renderEntries(); }); }); }
  function addEntry() { var v = parseFloat(entryVal.value); if (isNaN(v)) { toast('Введите число'); return; } var color = entryColor.value; var label = entryLabel.value.trim() || 'без метки'; var rgb = hexToRgb(color); if (!rgb) { toast('Неверный цвет'); return; } tempEntries.push({ val: v, color: color, label: label, r: rgb }); renderEntries(); entryVal.value = ''; entryLabel.value = ''; var maxVal = tempEntries.reduce(function(mx, e) { return Math.max(mx, e.val); }, 0); entryVal.value = (maxVal + 5); }
  function hexToRgb(hex) { var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null; }
  function savePalette() { var name = newPalName.value.trim() || 'Без названия'; if (tempEntries.length === 0) { toast('Добавьте хотя бы одну запись'); return; } var sorted = tempEntries.slice().sort(function(a, b) { return b.val - a.val; }); var items = sorted.map(function(e) { return { v: e.val, r: [e.r.r, e.r.g, e.r.b], l: e.label }; }); if (editingIndex >= 0) { var list = palettes[currentLayerForModal].list; if (editingIndex >= list.length) { toast('Ошибка: палитра не найдена'); return; } if (list[editingIndex].builtin) { toast('Нельзя редактировать встроенную палитру'); return; } list[editingIndex].name = name; list[editingIndex].items = items; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } toast('Палитра "' + name + '" обновлена'); closeForm(); } else { var newPal = { name: name, items: items, builtin: false }; palettes[currentLayerForModal].list.push(newPal); palettes[currentLayerForModal].activeIdx = palettes[currentLayerForModal].list.length - 1; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } toast('Палитра "' + name + '" сохранена'); closeForm(); } }
  function exportPalette() { var layer = currentLayerForModal || S.layer; var list = palettes[layer].list; var idx = palettes[layer].activeIdx; if (!list || list.length === 0 || idx >= list.length) { toast('Нет палитры для экспорта'); return; } var pal = list[idx]; var content = generatePalFile(pal.items, pal.name, layer); var blob = new Blob([content], { type: 'text/plain;charset=utf-8' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = (pal.name || 'palette') + '.pal'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); toast('Палитра "' + pal.name + '" экспортирована'); }
  function generatePalFile(items, name, layer) { var sorted = items.slice().sort(function(a, b) { return a.v - b.v; }); var lines = []; lines.push('Product: ' + (layer === 'radar' ? 'BR' : (layer === 'sat' ? 'SAT' : 'WX'))); lines.push('Units: ' + (layer === 'sat' ? 'brightness' : 'dBZ')); lines.push('Scale: 1'); lines.push('Offset: 0'); lines.push('Step: 5'); lines.push('RF: 0 0 0'); lines.push(''); for (var i = 0; i < sorted.length; i++) { var p = sorted[i]; var r = p.r[0], g = p.r[1], b = p.r[2]; lines.push('Color: ' + p.v + ' ' + r + ' ' + g + ' ' + b); } return lines.join('\n'); }
  function loadPaletteFromFile(file) { var reader = new FileReader(); reader.onload = function(e) { try { var content = e.target.result; var data = parsePaletteFile(content); if (data) { var name = file.name.replace(/\.[^.]+$/, '') || 'Загруженная'; var newPal = { name: name, items: data, builtin: false }; palettes[currentLayerForModal].list.push(newPal); palettes[currentLayerForModal].activeIdx = palettes[currentLayerForModal].list.length - 1; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } toast('Палитра загружена'); } else { toast('Ошибка парсинга файла'); } } catch (err) { toast('Ошибка: ' + err.message); } }; reader.readAsText(file); }
  function parsePaletteFile(text) { try { var parsed = JSON.parse(text); if (Array.isArray(parsed) && parsed.length && parsed[0].v !== undefined && parsed[0].r && parsed[0].l) { return parsed; } } catch (e) {} var lines = text.split(/\r?\n/).filter(function(line) { return line.trim().length > 0; }); var items = []; var inTable = false; for (var i = 0; i < lines.length; i++) { var line = lines[i].trim(); if (/^ColorTable\s*\{/.test(line)) { inTable = true; continue; } if (/^\}/.test(line)) { inTable = false; continue; } if (!inTable) continue; var match = line.match(/Color\s*\[\s*([\d.]+)\s*\]\s*=\s*(rgb|gradient)\s*\(\s*([^)]+)\s*\)/i); if (match) { var v = parseFloat(match[1]); var type = match[2].toLowerCase(); var params = match[3].split(/\s*,\s*/).filter(function(s) { return s.length > 0; }); if (type === 'rgb' && params.length >= 3) { var r = parseInt(params[0]); var g = parseInt(params[1]); var b = parseInt(params[2]); if (!isNaN(r) && !isNaN(g) && !isNaN(b)) { items.push({ v: v, r: [r, g, b], l: '>= ' + v + ' dBZ' }); } } else if (type === 'gradient' && params.length >= 6) { var r2 = parseInt(params[1]), g2 = parseInt(params[2]), b2 = parseInt(params[3]); if (!isNaN(r2) && !isNaN(g2) && !isNaN(b2)) { items.push({ v: v, r: [r2, g2, b2], l: '>= ' + v + ' dBZ' }); } } } } if (items.length > 0) { items.sort(function(a, b) { return b.v - a.v; }); return items; } var colorLines = []; var product = null; for (var j = 0; j < lines.length; j++) { var line2 = lines[j].trim(); if (/^Product:/i.test(line2)) { product = line2; } if (/^Color:/i.test(line2)) { colorLines.push(line2); } } if (colorLines.length > 0) { var newItems = []; for (var k = 0; k < colorLines.length; k++) { var parts = colorLines[k].split(/\s+/); if (parts.length >= 5) { var val = parseFloat(parts[1]); var r3 = parseInt(parts[2]); var g3 = parseInt(parts[3]); var b3 = parseInt(parts[4]); if (!isNaN(val) && !isNaN(r3) && !isNaN(g3) && !isNaN(b3)) { newItems.push({ v: val, r: [r3, g3, b3], l: val + ' dBZ' }); } } } if (newItems.length > 0) { newItems.sort(function(a, b) { return b.v - a.v; }); return newItems; } } var csvItems = []; for (var m = 0; m < lines.length; m++) { var line3 = lines[m].trim(); var parts2 = line3.split(/\s*,\s*/); if (parts2.length >= 5) { var v2 = parseFloat(parts2[0]); if (isNaN(v2)) continue; var r4 = parseInt(parts2[1]), g4 = parseInt(parts2[2]), b4 = parseInt(parts2[3]); if (isNaN(r4) || isNaN(g4) || isNaN(b4)) continue; var label = parts2.slice(4).join(',').trim() || 'без метки'; csvItems.push({ v: v2, r: [r4, g4, b4], l: label }); } else { var m2 = line3.match(/^([\d.]+)\s+#([a-fA-F0-9]{6})\s+(.+)$/); if (m2) { var v3 = parseFloat(m2[1]); if (isNaN(v3)) continue; var rgb = hexToRgb('#' + m2[2]); if (!rgb) continue; csvItems.push({ v: v3, r: [rgb.r, rgb.g, rgb.b], l: m2[3].trim() }); } } } if (csvItems.length === 0) return null; csvItems.sort(function(a, b) { return b.v - a.v; }); return csvItems; }

  modalClose.addEventListener('click', closeModal);
  modalTabs.forEach(function(btn) { btn.addEventListener('click', function() { currentLayerForModal = this.dataset.layer; modalTabs.forEach(function(b) { b.classList.toggle('active', b === btn); }); syncSatPalUI(); renderPaletteList(); closeForm(); }); });
  loadPaletteBtn.addEventListener('click', function() { fileInput.click(); });
  fileInput.addEventListener('change', function(e) { if (this.files && this.files[0]) { loadPaletteFromFile(this.files[0]); } this.value = ''; });
  exportPaletteBtn.addEventListener('click', exportPalette);
  createPaletteBtn.addEventListener('click', function() { closeForm(); editingIndex = -1; editingEntryIndex = -1; newPalName.value = 'Новая палитра'; tempEntries = []; renderEntries(); createForm.classList.add('open'); savePaletteBtn.textContent = '💾 Сохранить'; });
  cancelCreateBtn.addEventListener('click', function() { closeForm(); });
  addEntryBtn.addEventListener('click', addEntry);
  document.querySelectorAll('#entry-val, #entry-label').forEach(function(inp) { inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') addEntry(); }); });
  savePaletteBtn.addEventListener('click', savePalette);
  deletePaletteBtn.addEventListener('click', function() { var list = palettes[currentLayerForModal].list; var idx = palettes[currentLayerForModal].activeIdx; if (idx >= list.length) return; if (list[idx].builtin) { toast('Нельзя удалить встроенную палитру'); return; } if (confirm('Удалить активную палитру "' + list[idx].name + '"?')) { list.splice(idx, 1); if (palettes[currentLayerForModal].activeIdx >= list.length) palettes[currentLayerForModal].activeIdx = list.length - 1; if (palettes[currentLayerForModal].activeIdx < 0) palettes[currentLayerForModal].activeIdx = 0; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } } });
  $('btn-palettes').addEventListener('click', openModal);

  var opacitySlider = $('opacity-slider');
  var opacityVal = $('opacity-val');
  if (opacitySlider) {
    canvas.style.opacity = parseInt(opacitySlider.value) / 100;
    opacitySlider.addEventListener('input', function() {
      var val = parseInt(this.value);
      if (S.layer === 'sat' && eumetsatLayer) {
        eumetsatLayer.setOpacity(val / 100);
      } else {
        canvas.style.opacity = val / 100;
      }
      opacityVal.textContent = val + '%';
      retrig(opacityVal, 'bump'); /* лёгкий отклик значения */
      saveViewDebounced();
    });
  }

  var helpModal = $('help-modal');
  var helpClose = $('help-close');
  function closeHelp() { if (helpModal) { helpModal.classList.remove('open'); restoreFocus(); } }
  if ($('btn-help')) { $('btn-help').addEventListener('click', function() { if (helpModal) { lastFocused = document.activeElement; helpModal.classList.add('open'); focusModal(helpModal); } }); }
  if (helpClose) { helpClose.addEventListener('click', closeHelp); }
  /* Клик по фону закрывает модалки */
  modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
  if (helpModal) { helpModal.addEventListener('click', function(e) { if (e.target === helpModal) closeHelp(); }); }

  /* ─── Смена темы: мягкий кроссфейд тайл-слоёв (новый слой проявляется поверх ~350мс) ─── */
  function swapBaseLayer(toLayer, fromLayer) {
    if (!fromLayer) { toLayer.addTo(map); return; }
    if (REDUCE_MOTION) { map.removeLayer(fromLayer); toLayer.addTo(map); return; }
    toLayer.setOpacity(0); toLayer.addTo(map);
    var t0 = performance.now(), D = 350;
    (function step() {
      var k = Math.min(1, (performance.now() - t0) / D);
      toLayer.setOpacity(k);
      if (k < 1) requestAnimationFrame(step);
      else { if (map.hasLayer(fromLayer)) map.removeLayer(fromLayer); fromLayer.setOpacity(1); }
    })();
  }

  /* ─── БЛОК C: три темы — Тёмная → Светлая → Схема (Voyager, «как Google Maps») → цикл ───
     «Схема» — светлая карта, поэтому UI тоже светлый (body.light-theme):
     тёмные панели на светлой карте выглядят чужеродно, а светлая тема уже готова. */
  var THEME_ORDER = ['dark', 'light', 'scheme'];
  var currentTheme = 'dark';
  function themeLayer(name) { return name === 'dark' ? darkTileLayer : (name === 'light' ? lightTileLayer : voyagerTileLayer); }
  function themeLabel(name) { return name === 'dark' ? 'Тёмная' : (name === 'light' ? 'Светлая' : 'Схема'); }
  function activeBaseLayer() {
    if (map.hasLayer(darkTileLayer)) return darkTileLayer;
    if (map.hasLayer(lightTileLayer)) return lightTileLayer;
    if (map.hasLayer(voyagerTileLayer)) return voyagerTileLayer;
    return null;
  }
  function applyTheme(name, animate) {
    if (THEME_ORDER.indexOf(name) < 0) name = 'dark'; /* обратная совместимость с mapView */
    var to = themeLayer(name), from = activeBaseLayer();
    currentTheme = name;
    document.body.classList.toggle('light-theme', name !== 'dark');
    if ($('btn-theme')) $('btn-theme').textContent = 'Тема: ' + themeLabel(name);
    if (from !== to) {
      if (animate) swapBaseLayer(to, from);
      else { if (from) map.removeLayer(from); to.addTo(map); }
    }
    updateSatBackdrop(animate); /* в sat-режиме: dark — подложка не нужна, light/scheme — нужна */
  }
  if ($('btn-theme')) { $('btn-theme').addEventListener('click', function() { var next = THEME_ORDER[(THEME_ORDER.indexOf(currentTheme) + 1) % THEME_ORDER.length]; applyTheme(next, true); toast('Тема: ' + themeLabel(next)); saveViewDebounced(); }); }

  /* На таче приглушаем панели во время перетаскивания карты — карту видно целиком */
  if (IS_MOBILE) {
    var dragDimTmr = null;
    map.on('movestart', function() { if (document.querySelector('.dropdown-menu.visible')) return; /* дропдаун открыт — не глушим */ clearTimeout(dragDimTmr); document.body.classList.add('map-drag'); });
    map.on('moveend', function() { clearTimeout(dragDimTmr); dragDimTmr = setTimeout(function() { document.body.classList.remove('map-drag'); }, 250); });
  }

  /* ═══ БЛОК A: экспорт данных радара/спутника с видимой области ═══ */

  /* Имя файла: tatmeteo_{YYYY-MM-DD_HH-MM}_z{zoom}_{lat}_{lon} (время кадра МСК, без кириллицы) */
  function exportBaseName() {
    var s = new Date(S.ts * 1000).toLocaleString('sv-SE', { timeZone: 'Europe/Moscow' }); /* 'YYYY-MM-DD HH:MM:SS' */
    var c = map.getCenter();
    return 'tatmeteo_' + s.slice(0, 10) + '_' + s.slice(11, 16).replace(':', '-') + '_z' + map.getZoom() + '_' + c.lat.toFixed(3) + '_' + c.lng.toFixed(3);
  }
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
    toast('Экспортировано: ' + filename);
  }
  function dataUrlToU8(du) {
    var bin = atob(du.slice(du.indexOf(',') + 1));
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  /* ─── Мини-ZIP (метод STORE, без сжатия): PNG уже сжат, CSV/JSON крошечные.
     Собственные ~50 строк вместо CDN-библиотеки (fflate) — ноль зависимостей,
     формат тривиален, deflate дал бы выигрыш <2% на наших данных ─── */
  var crcTable = (function() { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) { /* files: [{name: 'a.png', data: Uint8Array}] */
    var enc = new TextEncoder(), chunks = [], central = [], offset = 0;
    files.forEach(function(f) {
      var nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      var lh = new Uint8Array(30 + nm.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, sz, true); lv.setUint32(22, sz, true);
      lv.setUint16(26, nm.length, true);
      lh.set(nm, 30);
      chunks.push(lh, f.data);
      var ch = new Uint8Array(46 + nm.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, sz, true); cv.setUint32(24, sz, true);
      cv.setUint16(28, nm.length, true); cv.setUint32(42, offset, true);
      ch.set(nm, 46);
      central.push(ch);
      offset += lh.length + sz;
    });
    var cdSize = 0; central.forEach(function(c) { cdSize += c.length; });
    var eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [eocd]), { type: 'application/zip' });
  }

  /* ─── Рендер видимой области радара в offscreen-canvas (из S.cache, как doRender, с DPR) ─── */
  function renderRadarToCanvas() {
    var W = Math.round(innerWidth * DPR), H = Math.round(innerHeight * DPR);
    var oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    var octx = oc.getContext('2d');
    octx.setTransform(DPR, 0, 0, DPR, 0, 0); octx.imageSmoothingEnabled = false;
    var tiles = visTiles(), missing = 0;
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i], entry = S.cache.get(CK(t.x, t.y));
      if (entry && entry.canvas) { var r = tileRect(t.x, t.y); if (r.sw > 0 && r.sh > 0) octx.drawImage(entry.canvas, r.sx, r.sy, r.sw, r.sh); }
      else missing++;
    }
    return { canvas: oc, missing: missing, total: tiles.length, w: W, h: H };
  }

  /* ─── Снимок спутника: перерисовываем видимые WMS-тайлы Leaflet в canvas ─── */
  function renderSatToCanvas() {
    if (!eumetsatLayer || !eumetsatLayer._tiles) return null;
    var W = Math.round(innerWidth * DPR), H = Math.round(innerHeight * DPR);
    var oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    var octx = oc.getContext('2d'); octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var tiles = eumetsatLayer._tiles, drawn = 0;
    Object.keys(tiles).forEach(function(k) {
      var t = tiles[k];
      if (!t.current || !t.loaded || !t.el || !t.el.complete || !t.el.naturalWidth) return;
      var c = t.coords, sz = 256;
      var nw = map.unproject(L.point(c.x * sz, c.y * sz), c.z);
      var se = map.unproject(L.point((c.x + 1) * sz, (c.y + 1) * sz), c.z);
      var p1 = map.latLngToContainerPoint(nw), p2 = map.latLngToContainerPoint(se);
      try { octx.drawImage(t.el, p1.x, p1.y, p2.x - p1.x, p2.y - p1.y); drawn++; } catch (e) {}
    });
    return drawn > 0 ? { canvas: oc, missing: 0, total: drawn, w: W, h: H } : null;
  }

  /* ═══ БЛОК A: композит «карта + слой» ═══ */

  /* Универсальная отрисовка видимых тайлов любого Leaflet-слоя в контекст (CSS-пиксели) */
  function drawTileLayerTo(octx, layer) {
    if (!layer || !layer._tiles) return 0;
    var tiles = layer._tiles, drawn = 0;
    Object.keys(tiles).forEach(function(k) {
      var t = tiles[k];
      if (!t.current || !t.loaded || !t.el || !t.el.complete || !t.el.naturalWidth) return;
      var c = t.coords, sz = 256;
      var nw = map.unproject(L.point(c.x * sz, c.y * sz), c.z);
      var se = map.unproject(L.point((c.x + 1) * sz, (c.y + 1) * sz), c.z);
      var p1 = map.latLngToContainerPoint(nw), p2 = map.latLngToContainerPoint(se);
      try { octx.drawImage(t.el, p1.x, p1.y, p2.x - p1.x, p2.y - p1.y); drawn++; } catch (e) {}
    });
    return drawn;
  }

  /* Базовая карта активной темы (+ тёмная подложка спутника, если она на карте) */
  function renderBasemapToCanvas(octx) {
    /* Фон-заливка на случай недогруженных тайлов базы — вместо «дыр» */
    octx.save(); octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.fillStyle = document.body.classList.contains('light-theme') ? '#e9eef3' : '#323441';
    octx.fillRect(0, 0, 1e6, 1e6); octx.restore();
    var n = drawTileLayerTo(octx, activeBaseLayer());
    if (satBackdropActive()) n += drawTileLayerTo(octx, satBackdropLayer); /* тёмная подложка спутника поверх базы — как на экране */
    return n;
  }

  /* Композит: база (непрозрачно) + данные с той же прозрачностью, что на экране.
     Прозрачность «впечатывается» в пиксели через globalAlpha. */
  function renderCompositeToCanvas() {
    var W = Math.round(innerWidth * DPR), H = Math.round(innerHeight * DPR);
    var oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    var octx = oc.getContext('2d');
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    renderBasemapToCanvas(octx);
    var missing = 0, total = 0;
    if (S.layer === 'sat') {
      var sat = renderSatToCanvas();
      if (sat) { octx.save(); octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalAlpha = SAT_OPACITY; octx.drawImage(sat.canvas, 0, 0); octx.restore(); total = sat.total; }
    } else {
      var rc = renderRadarToCanvas();
      octx.save(); octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalAlpha = (parseInt($('opacity-slider').value) || 100) / 100; /* как на экране */
      octx.imageSmoothingEnabled = false;
      octx.drawImage(rc.canvas, 0, 0);
      octx.restore();
      missing = rc.missing; total = rc.total;
    }
    return { canvas: oc, missing: missing, total: total, w: W, h: H };
  }

  /* ─── World-файл (.pgw) в EPSG:3857: строки A, B, C, D(отриц.), E, F.
     Веб-меркатор линеен в метрах → геопривязка точная (в QGIS задать слою CRS EPSG:3857) ─── */
  function makeWorldFile(W, H) {
    var b = map.getBounds();
    var nw = L.CRS.EPSG3857.project(b.getNorthWest()); /* метры */
    var se = L.CRS.EPSG3857.project(b.getSouthEast());
    var A = (se.x - nw.x) / W;         /* размер пикселя по X */
    var D = -((nw.y - se.y) / H);      /* по Y — отрицательный (строки идут вниз) */
    var E = nw.x + A / 2, F = nw.y + D / 2; /* центр верхнего левого пикселя */
    return [A, 0, 0, D, E, F].map(function(v) { return Number(v).toFixed(6); }).join('\n') + '\n';
  }

  function exportMeta(rc, isComposite) {
    var b = map.getBounds(), c = map.getCenter();
    var palName = '';
    try {
      if (S.layer === 'sat') { var sp = satActivePalette(); palName = sp ? sp.name : ''; }
      else { var pl = palettes[S.layer]; palName = pl.list[pl.activeIdx].name; }
    } catch (e) {}
    return {
      generator: 'tatmeteo | КиберРадар',
      frame_time_msk: new Date(S.ts * 1000).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
      layer: S.layer,
      sat_channel: S.layer === 'sat' ? SAT_CHANNELS[satChIdx].id : undefined,
      composite: isComposite ? true : undefined,
      basemap_theme: isComposite ? currentTheme : undefined,
      sat_backdrop: isComposite && satBackdropActive() ? 'dark_all под спутником' : undefined,
      zoom: map.getZoom(),
      center: [+c.lat.toFixed(5), +c.lng.toFixed(5)],
      bounds_deg: [[+b.getSouth().toFixed(5), +b.getWest().toFixed(5)], [+b.getNorth().toFixed(5), +b.getEast().toFixed(5)]],
      crs: 'EPSG:3857 (world-файл в метрах веб-меркатора)',
      width_px: rc.w, height_px: rc.h,
      resolution_km: S.layer === 'sat' ? undefined : (S.px * BASE_RES_KM),
      palette: palName,
      /* Применённая калибровка (Блок D) — чтобы данные были воспроизводимы */
      calibration: S.layer === 'sat'
        ? (CAL.sat.auto ? { mode: 'auto', stretch: satAutoStretch[SAT_CHANNELS[satChIdx].id] || null } : { mode: 'manual', offset: CAL.sat.offset, gain: CAL.sat.gain, gamma: CAL.sat.gamma })
        : { dbzOffset: CAL.radar.dbzOffset, dbzGain: CAL.radar.dbzGain },
      missing_tiles: rc.missing ? rc.missing + ' из ' + rc.total + ' тайлов не были загружены на момент экспорта' : undefined,
      attribution: (S.layer === 'sat' ? '© EUMETSAT' : 'rainradar.ru') + (isComposite ? ' · базовая карта © OpenStreetMap, © CARTO' : '')
    };
  }

  /* ─── CSV значений dBZ по видимой области (из raw-данных кэша, лимит ~40 тыс. строк) ─── */
  function exportCSV(baseName, onDone) {
    var tiles = visTiles(), epx = (S.px < 1) ? 1 : S.px;
    /* Подбор шага сетки, чтобы не раздуть файл */
    var est = 0;
    tiles.forEach(function(t) { var e = S.cache.get(CK(t.x, t.y)); if (e && e.raw) { var W = e.canvas.width; est += Math.pow(Math.ceil(W / epx), 2); } });
    var stride = Math.max(1, Math.ceil(Math.sqrt(est / 40000)));
    var rows = [], skippedTiles = 0, idx = 0;
    function procTile() { /* по тайлу за таймслот — UI не замирает */
      var budgetEnd = idx + 3;
      for (; idx < tiles.length && idx < budgetEnd; idx++) {
        var t = tiles[idx], entry = S.cache.get(CK(t.x, t.y));
        if (!entry || !entry.raw) { skippedTiles++; continue; }
        var W = entry.canvas.width, bw = Math.ceil(W / epx);
        var r = tileRect(t.x, t.y);
        if (r.sw <= 0 || r.sh <= 0) continue;
        for (var by = 0; by < bw; by += stride) {
          for (var bx = 0; bx < bw; bx += stride) {
            /* клип к экрану: центр ячейки в контейнерных координатах */
            var fx = (bx + 0.5) * epx / W, fy = (by + 0.5) * epx / W;
            var sx = r.sx + fx * r.sw, sy = r.sy + fy * r.sh;
            if (sx < 0 || sx > innerWidth || sy < 0 || sy > innerHeight) continue;
            var ix = Math.min(W - 1, Math.round((bx + 0.5) * epx)), iy = Math.min(W - 1, Math.round((by + 0.5) * epx));
            var v = entry.raw[iy * W + ix];
            if (!(v >= MDBZ)) continue; /* только ячейки с данными */
            var lat = y2lat(t.y + fy, FZ), lng = x2lon(t.x + fx, FZ);
            rows.push(lat.toFixed(4) + ',' + lng.toFixed(4) + ',' + Math.round(calDbz(v))); /* экспортируем откалиброванный dBZ */
          }
        }
      }
      if (idx < tiles.length) { setTimeout(procTile, 0); return; }
      var meta = exportMeta({ w: innerWidth, h: innerHeight, missing: skippedTiles, total: tiles.length });
      var head = '# tatmeteo radar export (dBZ)\n# frame_time_msk: ' + meta.frame_time_msk +
        '\n# layer: ' + meta.layer + ' | zoom: ' + meta.zoom + ' | resolution_km: ' + meta.resolution_km +
        '\n# grid_stride: ' + stride + (skippedTiles ? ' | missing_tiles: ' + skippedTiles : '') +
        '\n# calibration: dbzOffset=' + CAL.radar.dbzOffset + ' dbzGain=' + CAL.radar.dbzGain +
        '\nlat,lng,dbz\n';
      downloadBlob(new Blob([head + rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), baseName + '.csv');
      onDone();
    }
    procTile();
  }

  /* ─── Ожидание недостающих тайлов перед экспортом (до 6с, шаг 300мс) ─── */
  function waitForTiles(cb) {
    var t0 = Date.now();
    (function check() {
      var missing = 0, tiles = visTiles();
      for (var i = 0; i < tiles.length; i++) if (!S.cache.has(CK(tiles[i].x, tiles[i].y))) missing++;
      if (missing === 0 || Date.now() - t0 > 6000) { cb(missing); return; }
      setTimeout(check, 300);
    })();
  }

  function doExport(fmt) {
    if (fmt === 'csv' && S.layer === 'sat') { toast('CSV доступен только для радара/явлений'); return; }
    if (S.layer !== 'sat' && !S.dbzVisible) { toast('Слой скрыт — включите 👁 для экспорта'); return; }
    var btn = $('btn-download');
    btn.classList.add('busy-export');
    var finish = function() { btn.classList.remove('busy-export'); };
    var base = exportBaseName();

    /* ─── Композит «карта + слой»: map — PNG, mapgeo — ZIP с геопривязкой.
       Два пункта, а не один ZIP: быстрый PNG «поделиться» — самый частый сценарий,
       ГИС-пакет нужен реже ─── */
    if (fmt === 'map' || fmt === 'mapgeo') {
      toast('⏳ Собираю композит…');
      var run = function() {
        setTimeout(function() {
          try {
            var rc = renderCompositeToCanvas();
            var du;
            try { du = rc.canvas.toDataURL('image/png'); }
            catch (e) { toast('Композит недоступен: тайлы без CORS (обновите страницу — базовые слои теперь с CORS)'); return; }
            if (fmt === 'map') { downloadBlob(new Blob([dataUrlToU8(du)], { type: 'image/png' }), base + '_map.png'); }
            else {
              var files = [
                { name: base + '_map.png', data: dataUrlToU8(du) },
                { name: base + '_map.pgw', data: new TextEncoder().encode(makeWorldFile(rc.w, rc.h)) },
                { name: base + '_map.json', data: new TextEncoder().encode(JSON.stringify(exportMeta(rc, true), null, 2)) }
              ];
              downloadBlob(makeZip(files), base + '_map.zip');
            }
          } finally { finish(); }
        }, 30);
      };
      if (S.layer === 'sat') { run(); } else { waitForTiles(function() { run(); }); }
      return;
    }

    if (S.layer === 'sat') { /* снимок спутника из DOM-тайлов Leaflet */
      setTimeout(function() {
        try {
          var rc = renderSatToCanvas();
          if (!rc) { toast('Спутниковые тайлы ещё не загружены'); return; }
          var du;
          try { du = rc.canvas.toDataURL('image/png'); }
          catch (e) { toast('Экспорт недоступен: прямой сервер без CORS (работает через прокси)'); return; }
          if (fmt === 'png') { downloadBlob(new Blob([dataUrlToU8(du)], { type: 'image/png' }), base + '.png'); }
          else { /* geo: ZIP = PNG + .pgw + JSON */
            var files = [
              { name: base + '.png', data: dataUrlToU8(du) },
              { name: base + '.pgw', data: new TextEncoder().encode(makeWorldFile(rc.w, rc.h)) },
              { name: base + '.json', data: new TextEncoder().encode(JSON.stringify(exportMeta(rc), null, 2)) }
            ];
            downloadBlob(makeZip(files), base + '.zip');
          }
        } finally { finish(); }
      }, 30);
      return;
    }

    if (fmt === 'csv') { exportCSV(base, finish); return; }

    toast('⏳ Подготовка экспорта…');
    waitForTiles(function(missing) {
      setTimeout(function() { /* отпускаем кадр — рендерим вне обработчика клика */
        try {
          var rc = renderRadarToCanvas();
          if (missing) rc.missing = missing;
          var du = rc.canvas.toDataURL('image/png'); /* радар рисуем сами — canvas всегда чистый */
          if (fmt === 'png') { downloadBlob(new Blob([dataUrlToU8(du)], { type: 'image/png' }), base + '.png'); }
          else {
            var files = [
              { name: base + '.png', data: dataUrlToU8(du) },
              { name: base + '.pgw', data: new TextEncoder().encode(makeWorldFile(rc.w, rc.h)) },
              { name: base + '.json', data: new TextEncoder().encode(JSON.stringify(exportMeta(rc), null, 2)) }
            ];
            downloadBlob(makeZip(files), base + '.zip');
          }
        } finally { finish(); }
      }, 30);
    });
  }

  /* Дропдаун экспорта: позиционируем fixed от кнопки — не обрезается скроллом #ctrl-scroll */
  (function initDownloadUI() {
    var btn = $('btn-download'), dd = $('download-dropdown');
    if (!btn || !dd) return;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (dd.classList.contains('visible')) { dd.classList.remove('visible'); return; }
      var r = btn.getBoundingClientRect();
      var left = Math.min(r.left, innerWidth - 230 - 8); /* не уходить за правый край */
      dd.style.left = Math.max(8, left) + 'px';
      dd.style.top = (r.bottom + 8) + 'px';
      dd.classList.add('visible');
    });
    dd.querySelectorAll('.dd-item').forEach(function(item) {
      var go = function() { dd.classList.remove('visible'); doExport(item.dataset.fmt); };
      item.addEventListener('click', go);
      item.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); btn.focus(); } });
    });
    document.addEventListener('click', function(e) { if (!$('download-wrapper').contains(e.target)) dd.classList.remove('visible'); });
  })();

  /* ─── БЛОК E: сохранение и восстановление вида карты и параметров (ключ mapView) ─── */
  function saveView() {
    try {
      var c = map.getCenter();
      localStorage.setItem('mapView', JSON.stringify({
        center: [+c.lat.toFixed(4), +c.lng.toFixed(4)],
        zoom: map.getZoom(),
        layer: S.layer,
        satChannel: SAT_CHANNELS[satChIdx].id, /* единый источник — дублирует satChannel-ключ */
        pxIndex: S.pxIndex,
        smooth: S.smooth,
        smoothStrength: S.smoothStrength,
        opacity: S.layer === 'sat' ? radarOpacityMem : (parseInt($('opacity-slider').value) || 100), /* 50% спутника не затирают настройку радара */
        theme: currentTheme, /* 'dark' | 'light' | 'scheme' */
        legendCollapsed: $('legend').classList.contains('collapsed'),
        dbzVisible: S.dbzVisible
      }));
    } catch (e) {}
  }
  var saveViewTmr = null;
  /* Дебаунс 150мс: быстрые свайпы/зумы успевают сохраниться до ухода со страницы */
  function saveViewDebounced() { clearTimeout(saveViewTmr); saveViewTmr = setTimeout(saveView, 150); }
  map.on('moveend zoomend', saveViewDebounced);
  map.on('zoom', saveViewDebounced); /* pinch/double-tap зум фиксируется ещё в процессе */
  /* ГЛАВНЫЙ фикс для мобильных: вкладка сворачивается/закрывается до дебаунса —
     сохраняем немедленно. pagehide надёжнее beforeunload на iOS/Android. */
  window.addEventListener('pagehide', saveView);
  document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden') saveView(); });
  window.addEventListener('beforeunload', saveView); /* не блокирующий, просто сейв */

  /* ─── Индикатор зума поверх слоя данных (#zoom-indicator): z-index 900 —
     выше канваса радара (350) и pane'ов Leaflet, ниже панелей (1000) ─── */
  function updZoomChip(bump) {
    var el = $('zoom-indicator'); if (!el) return;
    var txt = 'Z' + map.getZoom();
    if (el.textContent !== txt) {
      el.textContent = txt;
      if (bump && !REDUCE_MOTION) retrig(el, 'bump');
    }
  }
  map.on('zoom', function() { updZoomChip(false); });      /* живое обновление при pinch */
  map.on('zoomend', function() { updZoomChip(true); });    /* «bump» только по факту смены */

  /* Восстановление ДО первой тяжёлой отрисовки; время кадра не восстанавливаем — всегда LIVE */
  function restoreView() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem('mapView') || 'null'); } catch (e) {}
    if (!v || typeof v !== 'object') return;
    try {
      /* Валидация: зум [3..10], координаты — конечные числа; иначе дефолт [57,55] z6 */
      if (Array.isArray(v.center) && isFinite(v.center[0]) && isFinite(v.center[1]) && isFinite(v.zoom)) {
        var z = Math.max(3, Math.min(10, Math.round(v.zoom)));
        var la = Math.max(-85, Math.min(85, +v.center[0]));
        var lo = Math.max(-180, Math.min(180, +v.center[1]));
        map.setView([la, lo], z, { animate: false });
      }
      /* Тема: три режима; старые значения 'light'/'dark' работают, битые → 'dark' */
      if (typeof v.theme === 'string') applyTheme(v.theme, false);
      if (typeof v.pxIndex === 'number' && v.pxIndex >= 0 && v.pxIndex < S.pxLevels.length) {
        S.pxIndex = v.pxIndex | 0; S.px = S.pxLevels[S.pxIndex]; updatePxLabel();
      }
      if (typeof v.smoothStrength === 'number') {
        S.smoothStrength = Math.max(0, Math.min(4, v.smoothStrength | 0));
        $('smooth-strength').value = S.smoothStrength; $('smooth-val').textContent = S.smoothStrength;
      }
      if (v.smooth) { S.smooth = true; $('btn-smooth').classList.add('on'); $('smooth-control').classList.add('active'); }
      if (typeof v.opacity === 'number') {
        var op = Math.max(0, Math.min(100, v.opacity | 0));
        $('opacity-slider').value = op; $('opacity-val').textContent = op + '%'; canvas.style.opacity = op / 100;
      }
      if (v.legendCollapsed) { $('legend').classList.add('collapsed'); $('toggle-legend-btn').innerHTML = '+'; S.legendVis = false; }
      if (typeof v.satChannel === 'string') {
        var fi = -1;
        for (var i = 0; i < SAT_CHANNELS.length; i++) if (SAT_CHANNELS[i].id === v.satChannel) { fi = i; break; }
        if (fi >= 0 && fi !== satChIdx) {
          satChIdx = fi;
          $('btn-channel').textContent = 'Канал: ' + SAT_CHANNELS[fi].label;
          document.querySelectorAll('#channel-dropdown .dd-item').forEach(function(it, j) { it.classList.toggle('active', j === fi); });
        }
      }
      if (v.layer === 'sat' || v.layer === 'wx') setLayer(v.layer); /* sat пересоздаст WMS с каналом */
      if (v.dbzVisible === false && S.layer !== 'sat') {
        S.dbzVisible = false; canvas.style.display = 'none'; applyDbzUI();
      }
    } catch (e) { /* битые данные — остаёмся на дефолте */ }
  }

  loadPalettesFromStorage(); applyTheme('dark', false); restoreView(); buildLegend(); buildFrames(); updHUD(); updatePxLabel(); applyDbzUI(); schedRender();
  /* После restoreView (и при первом заходе без сохранений): актуальный зум в чипе
     и повторный invalidateSize — на мобильных вьюпорт меняется из-за URL-бара */
  updZoomChip(false);
  setTimeout(function() { map.invalidateSize(); updZoomChip(false); }, 100);
  window.addEventListener('load', function() { setTimeout(function() { map.invalidateSize(); }, 200); });

  $('playbtn').addEventListener('click', togglePlay);
  $('spd').addEventListener('click', cycleSpeed);
  $('pxbtn').addEventListener('click', cyclePx);
  $('btn-smooth').addEventListener('click', toggleSmooth);
  $('btn-refresh').addEventListener('click', doRefresh);
  /* Статус-чип кликабелен: на ПК — принудительное обновление, на мобильном сначала
     показываем полный текст (чип обрезан ellipsis'ом), т.к. title по тапу недоступен */
  $('dbg').addEventListener('click', function() {
    if (IS_MOBILE) { toast(this.textContent || ''); } else { doRefresh(); }
  });
  if ($('btn-toggle-dbz')) $('btn-toggle-dbz').addEventListener('click', toggleDbz);
  $('btn-crosshair').addEventListener('click', toggleCrosshair);
  $('btn-ruler').addEventListener('click', toggleRuler);
  $('b-minus1h').addEventListener('click', function() { retrig(this, 'bump'); shiftTs(-3600); });
  $('b-minus10m').addEventListener('click', function() { retrig(this, 'bump'); shiftTs(-600); });
  $('b-plus10m').addEventListener('click', function() { retrig(this, 'bump'); shiftTs(600); });
  $('toggle-legend-btn').addEventListener('click', function(e) { e.stopPropagation(); toggleLegend(); });
  $('legend-header').addEventListener('click', toggleLegend);

  $('btn-layers-menu').addEventListener('click', function(e) { e.stopPropagation(); $('layers-dropdown').classList.toggle('visible'); });
  document.querySelectorAll('#layers-dropdown .dd-item').forEach(function(item) {
    item.addEventListener('click', function() { setLayer(this.dataset.layer); $('layers-dropdown').classList.remove('visible'); });
    /* Клавиатура: Enter/Space выбирают слой */
    item.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLayer(this.dataset.layer); $('layers-dropdown').classList.remove('visible'); $('btn-layers-menu').focus(); } });
  });
  document.addEventListener('click', function(e) { if (!$('layers-wrapper').contains(e.target)) { $('layers-dropdown').classList.remove('visible'); } });

  var smoothSlider = $('smooth-strength');
  var smoothValEl = $('smooth-val');
  smoothSlider.addEventListener('input', function() { S.smoothStrength = parseInt(this.value); smoothValEl.textContent = S.smoothStrength; retrig(smoothValEl, 'bump'); if (S.smooth) { S.cache.clear(); S.pending.clear(); S.failed.clear(); forceRefresh(); toast('Сила сглаживания: ' + S.smoothStrength); } saveViewDebounced(); });

  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { if (crosshairMode) { toggleCrosshair(); return; } if (S.ruler.active) { toggleRuler(); return; } if (helpModal && helpModal.classList.contains('open')) { closeHelp(); return; } if (modal.classList.contains('open')) { closeModal(); return; } } });
  map.on('zoomstart', function() { if (crosshairMode) hoverEl.style.display = 'none'; });
  map.on('move moveend zoomend', function() { if (crosshairMode) updateCrosshair(); });
  window.addEventListener('resize', function() { if (crosshairMode) updateCrosshair(); });

  window.closeModal = closeModal; window.openModal = openModal; window.setLayer = setLayer;
  console.log('2×2 Радар загружен. 1x1 км интерполяция, EUMETSAT WMS и обновленные палитры активны.');
})();
