CREATE TABLE "storefront" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"config" jsonb DEFAULT '{"hero":null,"sections":[]}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storefront" ADD CONSTRAINT "storefront_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;