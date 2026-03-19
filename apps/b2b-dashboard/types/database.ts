// Types mirroring the merged B2C + B2B Supabase schema.
// B2C base tables: stores, products (with pgvector, POS sync columns)
// B2B additions:   stores.(name_heb, chain, logo_url)
//                  products.(category_id, sale_price, sale_until, image_url)
//                  categories, price_history tables
//
// Run `supabase gen types typescript` against a live project to regenerate.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      // ----------------------------------------------------------
      // STORES — B2C base + B2B additions
      // ----------------------------------------------------------
      stores: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string | null;
          address: string | null;
          city: string | null;
          phone: string | null;
          pos_provider: "morning" | "green_invoice" | "manual" | "other" | null;
          pos_store_id: string | null;
          is_active: boolean;
          lat: number | null;
          lng: number | null;
          // B2B additions
          name_heb: string | null;
          chain: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["stores"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["stores"]["Insert"]>;
      };

      // ----------------------------------------------------------
      // CATEGORIES — B2B-only table
      // ----------------------------------------------------------
      categories: {
        Row: {
          id: number;
          name_heb: string;
          name_ru: string | null;
          name_en: string;
          icon: string | null;
          store_id: string | null; // null = global seed
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["categories"]["Row"],
          "id" | "created_at"
        > & { id?: number };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
      };

      // ----------------------------------------------------------
      // PRODUCTS — B2C base + B2B additions
      // B2C columns: pos_item_id, raw_*, name_he, name_ru, name_en,
      //              normalized_name, category (text), price, unit,
      //              barcode, embedding, last_synced_at, sync_hash,
      //              is_available, quantity
      // B2B additions: category_id, sale_price, sale_until, image_url
      // ----------------------------------------------------------
      products: {
        Row: {
          id: string;
          store_id: string;
          // B2C POS raw data
          pos_item_id: string;
          raw_name: string;
          raw_price: number | null;
          raw_quantity: number | null;
          raw_unit: string | null;
          raw_barcode: string | null;
          // B2C normalized / LLM-enriched
          name_he: string | null;
          name_ru: string | null;
          name_en: string | null;
          normalized_name: string | null; // computed: coalesce(name_he, name_en, raw_name)
          category: string | null;        // free-text LLM category (B2C)
          price: number | null;
          quantity: number | null;
          unit: "kg" | "g" | "liter" | "ml" | "pcs" | "pack" | "other" | null;
          barcode: string | null;
          last_synced_at: string;
          sync_hash: string | null;
          is_available: boolean;
          // B2B additions
          category_id: number | null;     // FK to categories table
          sale_price: number | null;
          sale_until: string | null;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["products"]["Row"],
          "id" | "normalized_name" | "created_at" | "updated_at" | "last_synced_at"
        > & { id?: string; last_synced_at?: string };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };

      // ----------------------------------------------------------
      // PRICE HISTORY — B2B-only, append-only audit log
      // ----------------------------------------------------------
      price_history: {
        Row: {
          id: number;
          product_id: string;
          store_id: string;
          old_price: number | null;
          new_price: number;
          changed_by: string | null;
          source: string | null;
          recorded_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["price_history"]["Row"],
          "id" | "recorded_at"
        > & { id?: number };
        Update: never; // append-only
      };
    };
  };
}

// Convenience aliases
export type Store = Database["public"]["Tables"]["stores"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type PriceHistory = Database["public"]["Tables"]["price_history"]["Row"];

// Shape of a single row parsed from a B2B CSV/Excel upload.
// Maps to B2C column names so it can be inserted directly.
export interface ProductUploadRow {
  name_he: string;       // required — maps to products.name_he
  name_ru?: string;
  name_en?: string;
  barcode?: string;
  category?: string;     // raw text — will be matched against categories.name_en
  price: number;         // maps to products.price
  unit?: string;
}
