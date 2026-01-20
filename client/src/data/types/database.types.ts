// ------------------------------------------------------------
// ⚠️  This file is auto-generated. Do not edit directly.
// ------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      "bet_participations": {
        Row: {
          "bet_id": string;
          "participation_id": string;
          "participation_time": string;
          "table_id": string;
          "user_guess": string | null;
          "user_id": string;
        };
        Insert: {
          "bet_id": string;
          "participation_id"?: string;
          "participation_time"?: string;
          "table_id": string;
          "user_guess"?: string | null;
          "user_id": string;
        };
        Update: {
          "bet_id"?: string;
          "participation_id"?: string;
          "participation_time"?: string;
          "table_id"?: string;
          "user_guess"?: string | null;
          "user_id"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bet_participations_bet_id_fkey";
            columns: ["bet_id"];
            referencedRelation: "bet_proposals";
            referencedColumns: ["bet_id"];
          },
          {
            foreignKeyName: "bet_participations_table_id_fkey";
            columns: ["table_id"];
            referencedRelation: "bet_proposals";
            referencedColumns: ["bet_id"];
          },
          {
            foreignKeyName: "bet_participations_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      "bet_proposals": {
        Row: {
          "bet_id": string;
          "bet_status": string;
          "close_time": string;
          "description": string;
          "league": "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "U2Pick";
          "league_game_id": string | null;
          "mode_key": string;
          "proposal_time": string;
          "proposer_user_id": string;
          "resolution_time": string | null;
          "table_id": string;
          "time_limit_seconds": number;
          "wager_amount": string;
          "winning_choice": string | null;
        };
        Insert: {
          "bet_id"?: string;
          "bet_status"?: string;
          "close_time": string;
          "description": string;
          "league"?: "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "U2Pick";
          "league_game_id"?: string | null;
          "mode_key": string;
          "proposal_time"?: string;
          "proposer_user_id": string;
          "resolution_time"?: string | null;
          "table_id": string;
          "time_limit_seconds": number;
          "wager_amount": string;
          "winning_choice"?: string | null;
        };
        Update: {
          "bet_id"?: string;
          "bet_status"?: string;
          "close_time"?: string;
          "description"?: string;
          "league"?: "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "U2Pick";
          "league_game_id"?: string | null;
          "mode_key"?: string;
          "proposal_time"?: string;
          "proposer_user_id"?: string;
          "resolution_time"?: string | null;
          "table_id"?: string;
          "time_limit_seconds"?: number;
          "wager_amount"?: string;
          "winning_choice"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bet_proposals_proposer_user_id_fkey";
            columns: ["proposer_user_id"];
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "bet_proposals_table_id_fkey";
            columns: ["table_id"];
            referencedRelation: "tables";
            referencedColumns: ["table_id"];
          },
        ];
      };
      "friend_requests": {
        Row: {
          "created_at": string;
          "receiver_user_id": string;
          "request_id": string;
          "responded_at": string | null;
          "sender_user_id": string;
          "status": string;
        };
        Insert: {
          "created_at"?: string;
          "receiver_user_id": string;
          "request_id"?: string;
          "responded_at"?: string | null;
          "sender_user_id": string;
          "status"?: string;
        };
        Update: {
          "created_at"?: string;
          "receiver_user_id"?: string;
          "request_id"?: string;
          "responded_at"?: string | null;
          "sender_user_id"?: string;
          "status"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_user_id_fkey";
            columns: ["receiver_user_id"];
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "friend_requests_sender_user_id_fkey";
            columns: ["sender_user_id"];
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      "friends": {
        Row: {
          "created_at": string;
          "user_id1": string;
          "user_id2": string;
        };
        Insert: {
          "created_at"?: string;
          "user_id1"?: string;
          "user_id2"?: string;
        };
        Update: {
          "created_at"?: string;
          "user_id1"?: string;
          "user_id2"?: string;
        };
        Relationships: [];
      };
      "messages": {
        Row: {
          "bet_id": string | null;
          "created_at": string;
          "message_id": string;
          "message_type": string;
          "posted_at": string;
          "system_message_id": string | null;
          "table_id": string;
          "text_message_id": string | null;
        };
        Insert: {
          "bet_id"?: string | null;
          "created_at"?: string;
          "message_id"?: string;
          "message_type": string;
          "posted_at"?: string;
          "system_message_id"?: string | null;
          "table_id": string;
          "text_message_id"?: string | null;
        };
        Update: {
          "bet_id"?: string | null;
          "created_at"?: string;
          "message_id"?: string;
          "message_type"?: string;
          "posted_at"?: string;
          "system_message_id"?: string | null;
          "table_id"?: string;
          "text_message_id"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_bet_id_fkey";
            columns: ["bet_id"];
            referencedRelation: "bet_proposals";
            referencedColumns: ["bet_id"];
          },
          {
            foreignKeyName: "messages_system_message_id_fkey";
            columns: ["system_message_id"];
            referencedRelation: "system_messages";
            referencedColumns: ["system_message_id"];
          },
          {
            foreignKeyName: "messages_table_id_fkey";
            columns: ["table_id"];
            referencedRelation: "tables";
            referencedColumns: ["table_id"];
          },
          {
            foreignKeyName: "messages_text_message_id_fkey";
            columns: ["text_message_id"];
            referencedRelation: "text_messages";
            referencedColumns: ["text_message_id"];
          },
        ];
      };
      "resolution_history": {
        Row: {
          "bet_id": string;
          "created_at": string;
          "event_type": string;
          "payload": Json;
          "resolution_history_id": string;
        };
        Insert: {
          "bet_id": string;
          "created_at"?: string;
          "event_type": string;
          "payload"?: Json;
          "resolution_history_id"?: string;
        };
        Update: {
          "bet_id"?: string;
          "created_at"?: string;
          "event_type"?: string;
          "payload"?: Json;
          "resolution_history_id"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resolution_history_bet_id_fkey";
            columns: ["bet_id"];
            referencedRelation: "bet_proposals";
            referencedColumns: ["bet_id"];
          },
        ];
      };
      "system_messages": {
        Row: {
          "generated_at": string | null;
          "message_text": string;
          "system_message_id": string;
          "table_id": string;
        };
        Insert: {
          "generated_at"?: string | null;
          "message_text": string;
          "system_message_id"?: string;
          "table_id": string;
        };
        Update: {
          "generated_at"?: string | null;
          "message_text"?: string;
          "system_message_id"?: string;
          "table_id"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_messages_table_id_fkey";
            columns: ["table_id"];
            referencedRelation: "tables";
            referencedColumns: ["table_id"];
          },
        ];
      };
      "table_members": {
        Row: {
          "balance": number;
          "joined_at": string | null;
          "member_id": string;
          "table_id": string;
          "user_id": string;
        };
        Insert: {
          "balance"?: number;
          "joined_at"?: string | null;
          "member_id"?: string;
          "table_id"?: string;
          "user_id"?: string;
        };
        Update: {
          "balance"?: number;
          "joined_at"?: string | null;
          "member_id"?: string;
          "table_id"?: string;
          "user_id"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "table_members_table_id_fkey";
            columns: ["table_id"];
            referencedRelation: "tables";
            referencedColumns: ["table_id"];
          },
          {
            foreignKeyName: "table_members_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      "tables": {
        Row: {
          "created_at": string | null;
          "host_user_id": string;
          "last_activity_at": string | null;
          "table_id": string;
          "table_name": string;
        };
        Insert: {
          "created_at"?: string | null;
          "host_user_id": string;
          "last_activity_at"?: string | null;
          "table_id"?: string;
          "table_name": string;
        };
        Update: {
          "created_at"?: string | null;
          "host_user_id"?: string;
          "last_activity_at"?: string | null;
          "table_id"?: string;
          "table_name"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tables_host_user_id_fkey";
            columns: ["host_user_id"];
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      "text_messages": {
        Row: {
          "message_text": string;
          "posted_at": string | null;
          "table_id": string;
          "text_message_id": string;
          "user_id": string;
        };
        Insert: {
          "message_text": string;
          "posted_at"?: string | null;
          "table_id": string;
          "text_message_id"?: string;
          "user_id": string;
        };
        Update: {
          "message_text"?: string;
          "posted_at"?: string | null;
          "table_id"?: string;
          "text_message_id"?: string;
          "user_id"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "text_messages_table_id_fkey";
            columns: ["table_id"];
            referencedRelation: "tables";
            referencedColumns: ["table_id"];
          },
          {
            foreignKeyName: "text_messages_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      "users": {
        Row: {
          "created_at": string;
          "email": string;
          "updated_at": string;
          "user_id": string;
          "username": string | null;
        };
        Insert: {
          "created_at"?: string;
          "email": string;
          "updated_at"?: string;
          "user_id"?: string;
          "username"?: string | null;
        };
        Update: {
          "created_at"?: string;
          "email"?: string;
          "updated_at"?: string;
          "user_id"?: string;
          "username"?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      league: "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "U2Pick";
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
