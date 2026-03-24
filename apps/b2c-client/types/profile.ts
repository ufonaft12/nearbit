export interface ProfileRow {
  user_id: string;
  address: string | null;
  city: string | null;
  updated_at: string;
}

export interface ProfileUpdate {
  address?: string | null;
  city?: string | null;
}
