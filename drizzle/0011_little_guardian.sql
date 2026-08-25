ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
CREATE FUNCTION "set_account_issuer_for_supported_provider"() RETURNS trigger AS $$
BEGIN
	IF NEW."issuer" IS NULL THEN
		NEW."issuer" := CASE NEW."providerId"
			WHEN 'credential' THEN 'local:credential'
			WHEN 'google' THEN 'https://accounts.google.com'
			WHEN 'discord' THEN 'local:oauth:discord'
		END;
	END IF;
	IF NEW."providerId" = 'credential' AND NEW."issuer" = 'local:credential' THEN
		NEW."accountId" := NEW."userId";
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "set_account_issuer_for_supported_provider"
	BEFORE INSERT OR UPDATE OF "issuer", "providerId", "accountId", "userId" ON "account"
	FOR EACH ROW EXECUTE FUNCTION "set_account_issuer_for_supported_provider"();--> statement-breakpoint
UPDATE "account"
SET "accountId" = "userId", "issuer" = 'local:credential'
WHERE "providerId" = 'credential';--> statement-breakpoint
UPDATE "account"
SET "issuer" = 'https://accounts.google.com'
WHERE "providerId" = 'google';--> statement-breakpoint
UPDATE "account"
SET "issuer" = 'local:oauth:discord'
WHERE "providerId" = 'discord';--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "account" WHERE "issuer" IS NULL) THEN
		RAISE EXCEPTION 'account issuer backfill found an unsupported provider';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM "account"
		GROUP BY "issuer", "accountId"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'account issuer backfill found duplicate identities';
	END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","accountId");
