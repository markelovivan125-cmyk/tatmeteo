/* ─── Сеть ДМРЛ: доплеровские метеорадиолокаторы России (ДМРЛ-С, Росгидромет)
   и Беларуси (Белгидромет).

   ВАЖНО О ДАННЫХ: открытого официального JSON со списком станций нет
   (meteorad.ru — за авторизацией). Список собран 11.08.2026 из открытых
   источников (публикации Росгидромета/ЦАО о развёртывании сети ДМРЛ-С,
   открытые карты метеорадаров). Координаты ОРИЕНТИРОВОЧНЫЕ (точка города /
   аэропорта размещения, точность ~0.05–0.1°) — для маркера на карте этого
   достаточно, но список требует уточнения и дополнения (в сети 140+ позиций).
   Структура записи проста — дополняйте массив:
     { id: 'латиницей', name: 'Город', lat: 55.6, lon: 37.3, region: 'ФО/страна' }

   Файл подключается в index.html ДО script.js и публикует window.DMRL_SITES. */
window.DMRL_SITES = [
  /* ── Россия: Центральный ФО ── */
  { id: 'moskva',        name: 'Москва (Профсоюзная)',  lat: 55.66, lon: 37.51, region: 'ЦФО' },
  { id: 'valday',        name: 'Валдай',                lat: 57.98, lon: 33.24, region: 'СЗФО' },
  { id: 'smolensk',      name: 'Смоленск',              lat: 54.78, lon: 32.06, region: 'ЦФО' },
  { id: 'bryansk',       name: 'Брянск',                lat: 53.21, lon: 34.18, region: 'ЦФО' },
  { id: 'kursk',         name: 'Курск',                 lat: 51.77, lon: 36.17, region: 'ЦФО' },
  { id: 'voronezh',      name: 'Воронеж',               lat: 51.65, lon: 39.25, region: 'ЦФО' },
  { id: 'belgorod',      name: 'Белгород',              lat: 50.64, lon: 36.59, region: 'ЦФО' },
  { id: 'tula',          name: 'Тула',                  lat: 54.24, lon: 37.62, region: 'ЦФО' },
  { id: 'kostroma',      name: 'Кострома',              lat: 57.80, lon: 41.00, region: 'ЦФО' },
  /* ── Северо-Запад ── */
  { id: 'spb',           name: 'Санкт-Петербург (Воейково)', lat: 59.95, lon: 30.70, region: 'СЗФО' },
  { id: 'pskov',         name: 'Псков',                 lat: 57.81, lon: 28.35, region: 'СЗФО' },
  { id: 'petrozavodsk',  name: 'Петрозаводск',          lat: 61.78, lon: 34.35, region: 'СЗФО' },
  { id: 'murmansk',      name: 'Мурманск',              lat: 68.97, lon: 33.05, region: 'СЗФО' },
  { id: 'arhangelsk',    name: 'Архангельск',           lat: 64.55, lon: 40.58, region: 'СЗФО' },
  { id: 'syktyvkar',     name: 'Сыктывкар',             lat: 61.65, lon: 50.84, region: 'СЗФО' },
  { id: 'kaliningrad',   name: 'Калининград',           lat: 54.71, lon: 20.55, region: 'СЗФО' },
  /* ── Приволжье ── */
  { id: 'kazan',         name: 'Казань',                lat: 55.62, lon: 49.28, region: 'ПФО' },
  { id: 'nnovgorod',     name: 'Нижний Новгород',       lat: 56.23, lon: 43.79, region: 'ПФО' },
  { id: 'samara',        name: 'Самара',                lat: 53.25, lon: 50.45, region: 'ПФО' },
  { id: 'saratov',       name: 'Саратов',               lat: 51.56, lon: 46.03, region: 'ПФО' },
  { id: 'penza',         name: 'Пенза',                 lat: 53.11, lon: 45.02, region: 'ПФО' },
  { id: 'ufa',           name: 'Уфа',                   lat: 54.56, lon: 55.90, region: 'ПФО' },
  { id: 'perm',          name: 'Пермь',                 lat: 57.91, lon: 56.02, region: 'ПФО' },
  { id: 'izhevsk',       name: 'Ижевск',                lat: 56.83, lon: 53.46, region: 'ПФО' },
  { id: 'kirov',         name: 'Киров',                 lat: 58.50, lon: 49.35, region: 'ПФО' },
  { id: 'orenburg',      name: 'Оренбург',              lat: 51.80, lon: 55.10, region: 'ПФО' },
  /* ── Юг / Кавказ ── */
  { id: 'volgograd',     name: 'Волгоград',             lat: 48.78, lon: 44.35, region: 'ЮФО' },
  { id: 'rostov',        name: 'Ростов-на-Дону',        lat: 47.26, lon: 39.82, region: 'ЮФО' },
  { id: 'krasnodar',     name: 'Краснодар',             lat: 45.03, lon: 39.14, region: 'ЮФО' },
  { id: 'stavropol',     name: 'Ставрополь',            lat: 45.11, lon: 42.08, region: 'СКФО' },
  { id: 'minvody',       name: 'Минеральные Воды',      lat: 44.22, lon: 43.09, region: 'СКФО' },
  /* ── Урал / Сибирь / ДВ ── */
  { id: 'ekaterinburg',  name: 'Екатеринбург',          lat: 56.74, lon: 60.80, region: 'УФО' },
  { id: 'chelyabinsk',   name: 'Челябинск',             lat: 55.30, lon: 61.50, region: 'УФО' },
  { id: 'tyumen',        name: 'Тюмень',                lat: 57.12, lon: 65.43, region: 'УФО' },
  { id: 'omsk',          name: 'Омск',                  lat: 54.96, lon: 73.31, region: 'СФО' },
  { id: 'novosibirsk',   name: 'Новосибирск',           lat: 55.01, lon: 82.90, region: 'СФО' },
  { id: 'barnaul',       name: 'Барнаул',               lat: 53.36, lon: 83.55, region: 'СФО' },
  { id: 'krasnoyarsk',   name: 'Красноярск',            lat: 56.17, lon: 92.61, region: 'СФО' },
  { id: 'irkutsk',       name: 'Иркутск',               lat: 52.27, lon: 104.39, region: 'СФО' },
  { id: 'ulanude',       name: 'Улан-Удэ',              lat: 51.81, lon: 107.44, region: 'ДФО' },
  { id: 'chita',         name: 'Чита',                  lat: 52.03, lon: 113.48, region: 'ДФО' },
  { id: 'habarovsk',     name: 'Хабаровск',             lat: 48.52, lon: 135.17, region: 'ДФО' },
  { id: 'vladivostok',   name: 'Владивосток (Седанка)', lat: 43.22, lon: 131.98, region: 'ДФО' },
  { id: 'yuzhnosakh',    name: 'Южно-Сахалинск',        lat: 46.95, lon: 142.71, region: 'ДФО' },
  { id: 'petropavlovsk', name: 'Петропавловск-Камчатский', lat: 53.06, lon: 158.62, region: 'ДФО' },
  /* ── Беларусь (Белгидромет) ── */
  { id: 'minsk',         name: 'Минск',                 lat: 53.88, lon: 28.03, region: 'Беларусь' },
  { id: 'gomel',         name: 'Гомель',                lat: 52.53, lon: 31.02, region: 'Беларусь' },
  { id: 'vitebsk',       name: 'Витебск',               lat: 55.13, lon: 30.35, region: 'Беларусь' },
  { id: 'brest',         name: 'Брест',                 lat: 52.11, lon: 23.90, region: 'Беларусь' },
  { id: 'grodno',        name: 'Гродно',                lat: 53.60, lon: 24.05, region: 'Беларусь' },
  { id: 'mogilev',       name: 'Могилёв',               lat: 53.95, lon: 30.10, region: 'Беларусь' }
];
