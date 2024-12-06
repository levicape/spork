CREATE TABLE public.ratelimiter (
	pk TEXT NOT NULL,
	sk TEXT NOT NULL,
	gsis_pk___shard INT NOT NULL DEFAULT 0,
	gsip_pk___perimeter INT NOT NULL DEFAULT 0,
	gsi1_pk___tenant TEXT DEFAULT `.`;
	gsi1_sk___pk TEXT;
	jsondata jsonb,
	binpb bytea,
	protocol BIGINT NOT NULL,
	"application" BIGINT NOT NULL,
	created TIMESTAMP NOT NULL,
	updated TIMESTAMP,
	deleted TIMESTAMP,
	expiry_unix_second BIGINT,
	monotonic BIGINT NOT NULL,
	PRIMARY KEY (pk, sk)
);