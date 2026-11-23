CREATE TABLE "procedure_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"due_date" date,
	"official_url" text,
	"required_documents" text[] DEFAULT '{}'::text[] NOT NULL,
	"document_version_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"template_key" text,
	"key" text,
	"title" text NOT NULL,
	"category" text DEFAULT 'OTHER' NOT NULL,
	"country" text,
	"summary" text,
	"applies_if" text,
	"status" text DEFAULT 'TODO' NOT NULL,
	"due_date" date,
	"official_url" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"source" text DEFAULT 'USER' NOT NULL,
	"checked_at" date,
	"verified_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "procedure_steps" ADD CONSTRAINT "procedure_steps_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedure_steps_procedure_idx" ON "procedure_steps" USING btree ("procedure_id","position");--> statement-breakpoint
CREATE INDEX "procedures_move_idx" ON "procedures" USING btree ("move_id","status");--> statement-breakpoint
CREATE INDEX "procedures_due_idx" ON "procedures" USING btree ("due_date");