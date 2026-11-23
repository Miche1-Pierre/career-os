CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid,
	"domain" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"trigger" text DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"model" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results_found" integer DEFAULT 0 NOT NULL,
	"results_new" integer DEFAULT 0 NOT NULL,
	"created_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"move_id" uuid,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"use_agent" boolean DEFAULT false NOT NULL,
	"schedule" text DEFAULT 'OFF' NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_search_id_saved_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_runs_search_idx" ON "research_runs" USING btree ("search_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_searches_next_idx" ON "saved_searches" USING btree ("next_run_at");