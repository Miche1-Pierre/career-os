CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"summary" text,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actor" text DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"organization_id" uuid,
	"role" text,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"relationship" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_contact_at" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"label" text,
	"storage" text NOT NULL,
	"display_path" text,
	"relative_path" text,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"checksum" text,
	"snapshot_key" text,
	"file_modified_at" timestamp with time zone,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'OTHER' NOT NULL,
	"description" text,
	"language" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"metric" text NOT NULL,
	"target" integer NOT NULL,
	"period" text DEFAULT 'MONTH' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" date,
	"end_date" date,
	"archived" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"kind" text DEFAULT 'UNKNOWN' NOT NULL,
	"title" text,
	"source_type" text DEFAULT 'PASTE' NOT NULL,
	"source_url" text,
	"file_name" text,
	"mime_type" text,
	"raw_text" text NOT NULL,
	"content_hash" text,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"result_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"converted_type" text,
	"converted_id" uuid,
	"converted_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"kind" text DEFAULT 'OTHER' NOT NULL,
	"title" text,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"location" text,
	"meeting_url" text,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"preparation" text,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"feedback" text,
	"outcome" text DEFAULT 'PENDING' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" uuid,
	"key" text NOT NULL,
	"action" jsonb,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"organization_id" uuid,
	"stage_id" uuid NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"source" text,
	"source_detail" text,
	"url" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location_city" text,
	"location_country" text,
	"location_text" text,
	"remote_policy" text,
	"summary" text,
	"description" text,
	"responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nice_to_have" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deadline" date,
	"deadline_time" text,
	"application_opens_at" date,
	"discovered_at" date,
	"applied_at" date,
	"last_contact_at" date,
	"first_response_at" date,
	"expected_response_at" date,
	"next_follow_up_at" date,
	"follow_up_interval_days" integer,
	"follow_up_business_days" boolean,
	"follow_up_count" integer DEFAULT 0 NOT NULL,
	"follow_up_paused" boolean DEFAULT false NOT NULL,
	"closed_at" date,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"analysis" jsonb,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capture_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opportunity_contacts" (
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_contacts_opportunity_id_contact_id_pk" PRIMARY KEY("opportunity_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"role" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'COMPANY' NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"linkedin_url" text,
	"industry" text,
	"size" text,
	"city" text,
	"country" text,
	"description" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid,
	"interview_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"kind" text DEFAULT 'TODO' NOT NULL,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"auto_rule" text,
	"origin" text DEFAULT 'USER' NOT NULL,
	"rule_key" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid,
	"organization_id" uuid,
	"contact_id" uuid,
	"interview_id" uuid,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"channel" text,
	"direction" text,
	"actor" text DEFAULT 'USER' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_capture_id_inbox_items_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."inbox_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_contacts" ADD CONSTRAINT "opportunity_contacts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_contacts" ADD CONSTRAINT "opportunity_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_documents" ADD CONSTRAINT "opportunity_documents_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_documents" ADD CONSTRAINT "opportunity_documents_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "contacts_org_idx" ON "contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_doc_version_uq" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "document_versions_checksum_idx" ON "document_versions" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "documents_kind_idx" ON "documents" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "inbox_status_idx" ON "inbox_items" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "inbox_hash_idx" ON "inbox_items" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "interviews_opportunity_idx" ON "interviews" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "interviews_scheduled_idx" ON "interviews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_key_uq" ON "notifications" USING btree ("key");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "opportunities_stage_idx" ON "opportunities" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "opportunities_org_idx" ON "opportunities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "opportunities_type_idx" ON "opportunities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "opportunities_follow_up_idx" ON "opportunities" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "opportunities_deadline_idx" ON "opportunities" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "opportunities_tags_idx" ON "opportunities" USING gin ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_documents_uq" ON "opportunity_documents" USING btree ("opportunity_id","document_version_id","role");--> statement-breakpoint
CREATE INDEX "opportunity_documents_version_idx" ON "opportunity_documents" USING btree ("document_version_id");--> statement-breakpoint
CREATE INDEX "organizations_name_idx" ON "organizations" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "organizations_kind_idx" ON "organizations" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_pipeline_key_uq" ON "pipeline_stages" USING btree ("pipeline","key");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_uq" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "tasks_opportunity_idx" ON "tasks" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("done","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_rule_key_uq" ON "tasks" USING btree ("rule_key");--> statement-breakpoint
CREATE INDEX "timeline_opportunity_idx" ON "timeline_events" USING btree ("opportunity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "timeline_contact_idx" ON "timeline_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "timeline_org_idx" ON "timeline_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "timeline_occurred_idx" ON "timeline_events" USING btree ("occurred_at");