-- 1. Создаем таблицу для глобальных цен (крупные сети: Рами Леви, Шуферсаль и др.)
CREATE TABLE IF NOT EXISTS public.global_market_prices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    barcode text,
    name_heb text NOT NULL,
    price numeric(12, 2) NOT NULL,
    chain_name text NOT NULL, -- 'Rami Levy', 'Shufersal', 'Victory' и т.д.
    embedding vector(1536),   -- Для поиска совпадений без штрих-кода
    updated_at timestamptz DEFAULT now()
);

-- 2. Создаем индексы для производительности
-- Поиск по штрих-коду — самый быстрый
CREATE INDEX IF NOT EXISTS idx_global_prices_barcode 
ON public.global_market_prices(barcode);

-- Векторный индекс HNSW для мгновенного семантического поиска по названиям
CREATE INDEX IF NOT EXISTS idx_global_prices_embedding 
ON public.global_market_prices USING hnsw (embedding vector_cosine_ops);

-- 3. Функция для автоматического поиска цены конкурента
-- Логика: сначала ищем по штрих-коду, если нет — ищем ближайший по смыслу товар
CREATE OR REPLACE FUNCTION get_competitor_price(
    p_barcode text, 
    p_embedding vector(1536)
)
RETURNS TABLE (
    competitor_price numeric,
    competitor_chain text,
    match_type text
) AS $$
BEGIN
    -- 1. Попытка найти точное совпадение по штрих-коду
    IF p_barcode IS NOT NULL THEN
        RETURN QUERY
        SELECT price, chain_name, 'barcode'::text
        FROM global_market_prices
        WHERE barcode = p_barcode
        ORDER BY updated_at DESC
        LIMIT 1;
        
        IF FOUND THEN RETURN; END IF;
    END IF;

    -- 2. Если штрих-код не помог, используем векторный поиск
    RETURN QUERY
    SELECT price, chain_name, 'vector'::text
    FROM global_market_prices
    ORDER BY embedding <=> p_embedding
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;