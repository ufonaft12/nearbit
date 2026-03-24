# B2C Schema Reference

The base `stores` and `products` tables are owned by the B2C app and were
created by the B2C migrations (pgvector, IVFFlat index, semantic search
functions, geospatial lat/lng). **Do not recreate them here.**

Run the B2C migrations first, then run `002_b2b_additions.sql` to layer the
B2B-specific columns and tables on top.

## B2C column names used in this project

| Table    | B2C column     | Notes                                  |
|----------|----------------|----------------------------------------|
| products | `name_he`      | Hebrew product name (LLM-normalized)   |
| products | `name_ru`      | Russian product name                   |
| products | `name_en`      | English product name                   |
| products | `price`        | Canonical price (ILS)                  |
| products | `pos_item_id`  | NOT NULL UNIQUE with store_id          |
| products | `raw_name`     | NOT NULL — original POS name           |
| stores   | `name`         | Primary store name                     |
| stores   | `slug`         | URL-safe identifier (unique)           |
| stores   | `owner_id`     | FK → auth.users                        |
