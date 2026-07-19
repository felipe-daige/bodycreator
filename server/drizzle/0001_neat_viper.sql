CREATE TABLE "store_transactions" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"original_transaction_id" text NOT NULL,
	"product_id" text NOT NULL,
	"environment" text NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"last_validated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "packs" ADD COLUMN "is_free" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "packs" ADD COLUMN "store_product_id" text;--> statement-breakpoint
ALTER TABLE "packs" ADD CONSTRAINT "packs_store_product_id_unique" UNIQUE("store_product_id");