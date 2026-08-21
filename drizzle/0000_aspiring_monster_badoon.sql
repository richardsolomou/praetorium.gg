CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_users" (
	"battle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"side" integer NOT NULL,
	"joined_at" bigint NOT NULL,
	CONSTRAINT "battle_users_battle_id_user_id_pk" PRIMARY KEY("battle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"user_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"at" bigint NOT NULL,
	CONSTRAINT "collection_user_id_entry_id_pk" PRIMARY KEY("user_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "commands" (
	"battle_id" text NOT NULL,
	"seq" integer NOT NULL,
	"user_id" text NOT NULL,
	"at" bigint NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "commands_battle_id_seq_pk" PRIMARY KEY("battle_id","seq")
);
--> statement-breakpoint
CREATE TABLE "favourite_factions" (
	"user_id" text NOT NULL,
	"catalogue_id" text NOT NULL,
	"at" bigint NOT NULL,
	CONSTRAINT "favourite_factions_user_id_catalogue_id_pk" PRIMARY KEY("user_id","catalogue_id")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"requested_at" bigint NOT NULL,
	"accepted_at" bigint,
	CONSTRAINT "friendships_requester_id_addressee_id_pk" PRIMARY KEY("requester_id","addressee_id")
);
--> statement-breakpoint
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL,
	CONSTRAINT "rateLimit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "rosters" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"catalogue_id" text NOT NULL,
	"detachment_id" text,
	"disposition" text,
	"limit" integer NOT NULL,
	"picks" text NOT NULL,
	"prep" text,
	"tags" text DEFAULT '[]' NOT NULL,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"source" text DEFAULT 'legacy' NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_users" ADD CONSTRAINT "battle_users_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_users" ADD CONSTRAINT "battle_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourite_factions" ADD CONSTRAINT "favourite_factions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_user_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "battle_users_user_id_index" ON "battle_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "battles_token_unique" ON "battles" USING btree ("token");--> statement-breakpoint
CREATE INDEX "friendships_addressee_id_index" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "rosters_user_id_updated_at_index" ON "rosters" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");