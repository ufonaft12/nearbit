# ShoppyB2B — Merchant Dashboard

B2B-панель управления для владельцев продуктовых магазинов. Часть платформы Nearbit — агрегатора цен на продукты.

## Что это такое

Веб-приложение, которое позволяет владельцам магазинов:

- Загружать товарный каталог через CSV или Excel файл
- Управлять ценами и скидками на товары
- Просматривать историю изменений цен
- Генерировать и печатать ценники с QR-кодами (PDF)

Интерфейс поддерживает иврит (RTL) и русский язык, ориентирован на рынок израильских супермаркетов.

---

## Стек технологий

| Слой | Технология |
|------|-----------|
| Frontend | Next.js 15.1, React 19, TypeScript |
| Стили | Tailwind CSS |
| База данных | Supabase (PostgreSQL) |
| Аутентификация | Supabase Auth (Google OAuth + email/password) |
| Парсинг файлов | XLSX, PapaParse |
| PDF / QR | jsPDF, qrcode |
| Observability | Langfuse |

---

## Структура проекта

```
shoppyb2b/
├── app/
│   ├── (auth)/
│   │   ├── login/          # Страница входа (Google OAuth + email)
│   │   └── register/       # Регистрация
│   ├── auth/callback/      # Обработка OAuth-редиректа
│   └── business/           # Защищённые страницы (только авторизованные)
│       ├── dashboard/       # Главная: статистика + история цен
│       ├── inventory/       # Каталог товаров + загрузка файлов
│       ├── price-tags/      # Предпросмотр и экспорт ценников
│       └── settings/        # Настройки магазина
├── components/
│   ├── dashboard/          # StatsCard, Sidebar
│   ├── inventory/          # ProductsTable, UploadForm
│   └── price-tags/         # PriceTagPreview
├── lib/
│   ├── actions/            # Server Actions (загрузка инвентаря)
│   ├── supabase/           # Клиенты Supabase (server + client)
│   ├── langfuse/           # Обёртка для трассировки
│   └── utils/              # Парсер файлов, генерация PDF
├── types/
│   └── database.ts         # TypeScript-типы схемы Supabase
├── supabase/
│   └── migrations/         # SQL-миграции
└── middleware.ts            # Защита маршрутов (auth)
```

---

## Основные функции

### Dashboard (`/business/dashboard`)
- Карточки со статистикой: всего товаров, изменений цен за неделю
- Таблица последних 5 изменений цен (старая / новая цена, дата)

### Инвентарь (`/business/inventory`)
- Таблица товаров с поиском по названию (иврит/русский) или штрих-коду
- Отображение обычной и акционной цены, статуса товара

### Загрузка файлов (`/business/inventory/upload`)
- Drag-and-drop загрузка CSV, XLSX, XLS (до 10 МБ)
- Гибкое сопоставление колонок: поддерживается 6+ вариантов названий заголовков
- Обязательные колонки: `name_he`, `price`
- Опциональные: `name_ru`, `name_en`, `barcode`, `category`, `unit`
- Пакетная запись в БД (100 строк за раз), upsert по `pos_item_id`

### Ценники (`/business/price-tags`)
- Предпросмотр ценников: двуязычное название, цена в ILS, акционный бейдж, QR-код
- Мультиселект + экспорт выбранных ценников в PDF (формат A4, 2 ценника в ряд)

---

## База данных

Проект использует общую схему с B2C-агрегатором:

- **`stores`** — аккаунты магазинов
- **`products`** — товарный каталог (мультиязычные названия, цены, штрих-коды)
- **`categories`** — категории товаров
- **`price_history`** — аудит изменений цен (триггер `trg_b2b_price_change`)

B2B-добавления (`migrations/002_b2b_additions.sql`):
- `products.sale_price`, `products.sale_until` — акционные цены
- `products.image_url` — изображение товара
- `price_history.source` — источник изменения (`b2b_manual`, `b2b_csv` и др.)

Row-Level Security (RLS) обеспечивает изоляцию данных: каждый магазин видит только свои данные.

---

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Переменные окружения

Скопируйте `.env.local.example` в `.env.local` и заполните:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_BASEURL=...
OPENAI_API_KEY=...
```

### 3. Миграции БД

Примените миграции из папки `supabase/migrations/` в порядке нумерации через Supabase Dashboard или CLI.

### 4. Запуск

```bash
npm run dev      # http://localhost:3001
npm run build    # Сборка для продакшена
npm run start    # Запуск продакшена
npm run lint     # ESLint
```

> B2C-агрегатор запускается на порту 3000, B2B — на 3001.

---

## Поток данных при загрузке файла

```
Пользователь загружает CSV/Excel
  ↓
UploadForm валидирует тип и размер файла
  ↓
uploadInventoryAction (Server Action)
  ├─ Парсит файл (XLSX или CSV)
  ├─ Сопоставляет колонки (гибкие алиасы)
  ├─ Генерирует pos_item_id (штрих-код или slug)
  ├─ Пакетный upsert в БД (100 строк/чанк)
  └─ Возвращает { inserted, skipped, errors }
  ↓
UI отображает результат, инвалидирует кеш /business/inventory
```

---

## Архитектурные паттерны

- **Server Actions** — загрузка и обработка файлов на сервере
- **Dynamic rendering** — `export const dynamic = "force-dynamic"` для актуальных данных
- **Batch processing** — крупные загрузки разбиваются на чанки
- **Langfuse tracing** — обёртка `withTrace()` для observability AI-операций
- **RTL поддержка** — Hebrew-текст выровнен вправо (`dir="rtl"`)
- **Type-safe DB** — все типы схемы Supabase продублированы в TypeScript

---

## Связанные проекты

- **B2C агрегатор** — пользовательское приложение для сравнения цен (порт 3000, общая БД)
