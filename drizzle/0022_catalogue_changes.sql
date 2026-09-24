CREATE TABLE "catalogue_changes" (
	"from_snapshot" text NOT NULL,
	"to_snapshot" text NOT NULL,
	"recorded_at" bigint NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "catalogue_changes_from_snapshot_to_snapshot_pk" PRIMARY KEY("from_snapshot","to_snapshot")
);
--> statement-breakpoint
CREATE INDEX "catalogue_changes_recorded_at_index" ON "catalogue_changes" USING btree ("recorded_at");