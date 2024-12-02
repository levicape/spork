CREATE TABLE public.qureau_users (
	pk TEXT NOT NULL,
	sk TEXT NOT NULL,
	gsis_pk___shard INT NOT NULL DEFAULT 0,
	gsip_pk___perimeter INT NOT NULL DEFAULT 0,
	gsi1_pk___tenant TEXT DEFAULT `.`;
	gsi1_sk___pk TEXT;
	gsi2_pk__pk___username TEXT;
	gsi7_pk__pk___applicationId__username TEXT;
	gsi3_pk__pk___pk__applicationId__email TEXT;
	gsi4_pk__pk___pk__applicationId__providerResolvedId TEXT;
	gsi5_pk__pk___pk__applicationId__tokenId TEXT;
	gsi6_pk__pk___pk__applicationId__userRegistrationId TEXT;
	jsondata jsonb,
	binpb bytea,
	protocol BIGINT NOT NULL,
	"application" BIGINT NOT NULL,
	created TIMESTAMP NOT NULL,
	updated TIMESTAMP,
	deleted TIMESTAMP,
	expiry_unix_second BIGINT,
	monotonic BIGINT NOT NULL,
	owner_blob jsonb,
	principal_blob jsonb,
	genesis_blob jsonb,
	signature_blob jsonb,
	signature_salt bytea,
	scrypt_blob jsonb,
	owner_pb bytea,
	principal_pb bytea,
	genesis_pb bytea,
	request_pb bytea,
	signature_pb bytea,
	scrypt_pb bytea,
	PRIMARY KEY (pk, sk)
);

CREATE INDEX qureau_users_idx_gsii ON public.qureau_users
USING btree (sk, pk);

CREATE INDEX qureau_users_idx_gsis ON public.qureau_users
USING btree (gsis_pk___shard);

CREATE INDEX qureau_users_idx_gsip ON public.qureau_users
USING btree (gsip_pk___perimeter);

CREATE INDEX qureau_users_idx_gsi2 ON public.qureau_users
USING btree (gsi2_pk__pk___username);

CREATE INDEX qureau_users_idx_gsi7 ON public.qureau_users
USING btree (gsi7_pk__pk___applicationId__username);

CREATE INDEX qureau_users_idx_gsi3 ON public.qureau_users
USING btree (gsi3_pk__pk___pk__applicationId__email);

CREATE INDEX qureau_users_idx_gsi4 ON public.qureau_users
USING btree (gsi4_pk__pk___pk__applicationId__providerResolvedId);

CREATE INDEX qureau_users_idx_gsi5 ON public.qureau_users
USING btree (gsi5_pk__pk___pk__applicationId__tokenId);

CREATE INDEX qureau_users_idx_gsi6 ON public.qureau_users
USING btree (gsi6_pk__pk___pk__applicationId__userRegistrationId);

CREATE INDEX qureau_users_idx_gsi1 ON public.qureau_users
USING btree (gsi1_pk___tenant, gsi1_sk___pk);

CREATE TABLE public.qureau_users_activity (
	pk TEXT NOT NULL,
	sk TEXT NOT NULL,
	gsis_pk___shard INT NOT NULL DEFAULT 0,
	gsip_pk___perimeter INT NOT NULL DEFAULT 0,
	gsi1_pk___tenant TEXT DEFAULT `.`;
	gsi1_sk___pk TEXT;
	gsi2_pk__pk___username TEXT;
	gsi7_pk__pk___applicationId__username TEXT;
	gsi3_pk__pk___pk__applicationId__email TEXT;
	gsi4_pk__pk___pk__applicationId__providerResolvedId TEXT;
	gsi5_pk__pk___pk__applicationId__tokenId TEXT;
	gsi6_pk__pk___pk__applicationId__userRegistrationId TEXT;
	jsondata jsonb,
	binpb bytea,
	protocol BIGINT NOT NULL,
	"application" BIGINT NOT NULL,
	created TIMESTAMP NOT NULL,
	updated TIMESTAMP,
	deleted TIMESTAMP,
	expiry_unix_second BIGINT,
	monotonic BIGINT NOT NULL,
	owner_blob jsonb,
	principal_blob jsonb,
	genesis_blob jsonb,
	signature_blob jsonb,
	signature_salt bytea,
	scrypt_blob jsonb,
	owner_pb bytea,
	principal_pb bytea,
	genesis_pb bytea,
	request_pb bytea,
	signature_pb bytea,
	scrypt_pb bytea,
	PRIMARY KEY (pk, sk)
);

CREATE INDEX qureau_users_activity_idx_gsii ON public.qureau_users_activity
USING btree (sk, pk);

CREATE INDEX qureau_users_activity_idx_gsis ON public.qureau_users_activity
USING btree (gsis_pk___shard);

CREATE INDEX qureau_users_activity_idx_gsip ON public.qureau_users_activity
USING btree (gsip_pk___perimeter);

CREATE INDEX qureau_users_activity_idx_gsi2 ON public.qureau_users_activity
USING btree (gsi2_pk__pk___username);

CREATE INDEX qureau_users_activity_idx_gsi7 ON public.qureau_users_activity
USING btree (gsi7_pk__pk___applicationId__username);

CREATE INDEX qureau_users_activity_idx_gsi3 ON public.qureau_users_activity
USING btree (gsi3_pk__pk___pk__applicationId__email);

CREATE INDEX qureau_users_activity_idx_gsi4 ON public.qureau_users_activity
USING btree (gsi4_pk__pk___pk__applicationId__providerResolvedId);

CREATE INDEX qureau_users_activity_idx_gsi5 ON public.qureau_users_activity
USING btree (gsi5_pk__pk___pk__applicationId__tokenId);

CREATE INDEX qureau_users_activity_idx_gsi6 ON public.qureau_users_activity
USING btree (gsi6_pk__pk___pk__applicationId__userRegistrationId);

CREATE INDEX qureau_users_activity_idx_gsi1 ON public.qureau_users_activity
USING btree (gsi1_pk___tenant, gsi1_sk___pk);	

GRANT USAGE ON SCHEMA public TO fes_user;
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA public TO fes_user;