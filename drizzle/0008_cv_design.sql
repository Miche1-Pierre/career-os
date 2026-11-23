ALTER TABLE "cv_variants" ADD COLUMN "design" jsonb;--> statement-breakpoint
-- The name of a CV is now the name of its PDF file: start from the file names of the imported CVs.
UPDATE "cv_variants" SET "name" = regexp_replace("file_name", '\.pdf$', '', 'i') WHERE "file_name" IS NOT NULL AND "file_name" <> '';
