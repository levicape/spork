import assert from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Config, Context, Effect, Layer, Ref } from "effect";
import {
	type ExportedJWKSCache,
	type JWK,
	type JWKSCacheInput,
	type JWTPayload,
	type JWTVerifyResult,
	createLocalJWKSet,
	createRemoteJWKSet,
	jwksCache,
	jwtVerify,
} from "jose";
import type { ILogLayer } from "loglayer";
import { deserializeError } from "serialize-error";
import VError from "verror";
import { envsubst } from "../EnvSubst.mjs";
import { LoggingContext } from "../logging/LoggingContext.mjs";
import { JwkCache, type JwkCacheInterface } from "./JwkCache/JwkCache.mjs";
import { JwkLocalSynchronized } from "./JwkCache/JwkLocalSynchronized.mjs";
import { $$$JWT_SIGNATURE_JWK_URL } from "./JwtSignature.mjs";

type JwtVerifyFnWithKey = typeof jwtVerify;
export type JwtVerifyFnJose = (
	jwt: Parameters<JwtVerifyFnWithKey>[0],
	options: Parameters<JwtVerifyFnWithKey>[2],
) => Promise<JWTVerifyResult<JWTPayload>>;

export type JoseJwkKeyring =
	| ReturnType<typeof createLocalJWKSet>
	| ReturnType<typeof createRemoteJWKSet>
	| undefined;

export type JwtVerificationInterface = {
	config: JwtVerificationJoseEnvs;
	jwtVerify: JwtVerifyFnJose | null;
	jwks: JoseJwkKeyring | null;
};

export class JwtVerification extends Context.Tag("JwtVerification")<
	JwtVerification,
	JwtVerificationInterface
>() {}
/**
 * @private Environment variable constant for JWT_VERIFICATION_JWK_URL
 */
export const $$$JWT_VERIFICATION_JWKS_URL = "JWT_VERIFICATION_JWKS_URL";
export const $$$JWT_VERIFICATION_JWKS_CACHE_KEY =
	"JWT_VERIFICATION_JWKS_CACHE_KEY";
export class JwtVerificationJoseEnvs {
	constructor(
		/**
		 * URL of JWK verify key. Supported protocols: file.
		 * The keys must be in JWK format: `{ keys: [...] }`
		 * @see {@link JwtSignatureJose}
		 */
		readonly JWT_VERIFICATION_JWKS_URL?: string,
		readonly JWT_VERIFICATION_JWKS_CACHE_KEY?: string,
	) {}
}

export class JwtVerificationNoop implements JwtVerificationInterface {
	config = new JwtVerificationJoseEnvs();
	jwtVerify = null;
	jwks = null;
}
export class JwtVerificationJose {
	public jwks: JoseJwkKeyring | null = null;
	private cache: JWKSCacheInput | undefined;

	constructor(
		private logger: ILogLayer,
		public config: JwtVerificationJoseEnvs,
		private jwkCache: JwkCacheInterface,
	) {}

	initialize = async (local: ExportedJWKSCache | null) => {
		if (this.config.JWT_VERIFICATION_JWKS_URL) {
			const { JWT_VERIFICATION_JWKS_URL } = this.config;
			this.jwks = await (async () => {
				if (JWT_VERIFICATION_JWKS_URL.startsWith("http")) {
					this.cache = await this.jwkCache.getJwks();
					return await this.jwksFromUrl(JWT_VERIFICATION_JWKS_URL);
				}

				if (JWT_VERIFICATION_JWKS_URL.startsWith("file")) {
					return await this.jwksFromFile(JWT_VERIFICATION_JWKS_URL);
				}
				throw new VError(
					`Unsupported JWK URL format: ${JWT_VERIFICATION_JWKS_URL}`,
				);
			})();
		} else {
			if (local) {
				this.jwks = createLocalJWKSet(local.jwks);
				this.cache = local;
				this.logger
					?.withMetadata({
						JwtVerificationJose: {
							local,
							context: this.config,
						},
					})
					.debug(
						`${$$$JWT_VERIFICATION_JWKS_URL} not provided, using signature local key.
					To disable this behavior, set ${$$$JWT_SIGNATURE_JWK_URL} to "unload"`,
					);
			}
		}
	};

	static readJwksFile = async (file: string) => {
		let content: unknown;
		let json: unknown;

		content = readFileSync(fileURLToPath(file), "utf-8");
		json = JSON.parse(content as string);

		let keyring = json as unknown as { keys: JWK[] };
		assert(
			Array.isArray(keyring?.keys) && keyring.keys.length > 0,
			`Invalid JWK file: ${file}. Expected an array of keys.`,
		);
		return keyring;
	};

	private jwksFromFile = async (file: string) => {
		this.logger
			?.withMetadata({
				JwtVerificationJose: {
					context: this.config,
					file,
				},
			})
			.debug(`Using file ${$$$JWT_VERIFICATION_JWKS_URL}`);

		try {
			const keyset = await JwtVerificationJose.readJwksFile(file);
			if (this.cache) {
				await this.jwkCache.setJwks({
					jwks: keyset,
					uat: Math.floor(Date.now() / 1000),
				} as ExportedJWKSCache);
			}
			return createLocalJWKSet(keyset);
		} catch (e) {
			this.logger
				?.withMetadata({
					JwtVerificationJose: {
						context: this.config,
						file,
					},
				})
				.withError(e)
				.error("Failed to read JWK file");
			throw e;
		}
	};

	private jwksFromUrl = async (url: string) => {
		this.logger
			?.withMetadata({
				JwtVerificationJose: {
					context: this.config,
				},
			})
			.debug(`Using remote ${$$$JWT_VERIFICATION_JWKS_URL}`);

		return createRemoteJWKSet(new URL(url), {
			[jwksCache]: this.cache,
		});
	};

	/**
	 * Verifies a JWT using the JWKs.
	 * @param jwt The JWT to verify.
	 * @param options The options to use for verification.
	 * @returns The result of the verification.
	 */
	public jwtVerify: JwtVerifyFnJose = async (jwt, options) => {
		if (this.jwks === undefined || this.jwks === null) {
			this.logger
				?.withMetadata({
					JwtVerificationJose: {
						jwt,
						options,
					},
				})
				.error("JWTVerificationJose not initialized");
			throw new VError("JWTVerificationJose not initialized");
		}

		const result = await jwtVerify(jwt, this.jwks, options);
		if (this.cache) {
			await this.jwkCache.setJwks(this.cache as ExportedJWKSCache);
		}
		return result;
	};
}

export const SUPPORTED_PROTOCOLS = ["http", "file"] as const;
export const JwtVerificationJwksUrlConfig = Config.string(
	$$$JWT_VERIFICATION_JWKS_URL,
).pipe(
	Config.map((c) => envsubst(c)),
	Config.withDescription(
		`Oauth jwks_uri. Supported protocols: ${SUPPORTED_PROTOCOLS.join(", ")}`,
	),
	Config.withDefault(undefined),
);

export const JwtVerificationLayerConfig = Config.map(
	Config.all([
		JwtVerificationJwksUrlConfig,
		Config.string($$$JWT_VERIFICATION_JWKS_CACHE_KEY).pipe(
			Config.map((c) => envsubst(c)),
			Config.withDescription(`JWKs cache key. Defaults to "verify.json".`),
			Config.withDefault("verify.json" as const),
		),
	]),

	([JWT_VERIFICATION_JWKS_URI, JWT_VERIFICATION_JWKS_CACHE_KEY]) =>
		new JwtVerificationJoseEnvs(
			JWT_VERIFICATION_JWKS_URI,
			JWT_VERIFICATION_JWKS_CACHE_KEY,
		),
);

export const JwtVerificationLayer = Layer.effect(
	JwtVerification,
	Effect.gen(function* () {
		const console = yield* LoggingContext;
		const logger = yield* console.logger;
		const config = yield* JwtVerificationLayerConfig;
		const jwkCache = (yield* JwkCache).cache("verify.json");
		const mutex = yield* JwkLocalSynchronized;
		const { ref, cache } = yield* mutex;

		logger
			.withMetadata({ JwtVerificationLayer: { config } })
			.debug("JwtVerificationLayer waiting mutex");

		const jwtVerify = yield* cache.withPermits(1)(
			Effect.gen(function* () {
				logger
					.withMetadata({ JwtVerificationLayer: { config } })
					.debug("JwtVerificationLayer with mutex");

				if (config?.JWT_VERIFICATION_JWKS_URL?.toLowerCase() === "unload") {
					logger
						.withMetadata({ JwtVerificationLayer: { config } })
						.info("JwtVerificationLayer not loaded due to URI = 'unload'");
					return new JwtVerificationNoop();
				}

				const jwtVerify = new JwtVerificationJose(logger, config, jwkCache);

				const refvalue = yield* Ref.get(ref);
				yield* Effect.tryPromise({
					try: async () => {
						logger.debug("JwtVerificationLayer initializing");
						return jwtVerify.initialize(refvalue);
					},
					catch: (error) => {
						logger
							.withMetadata({ JwtVerificationLayer: { error } })
							.withError(deserializeError(error))
							.error("Failed to initialize JwtVerificationLayer");
					},
				});

				return jwtVerify;
			}),
		);
		return jwtVerify;
	}),
);

export const JwtVerificationAsyncLocalStorage = new AsyncLocalStorage<{
	JwtVerification: JwtVerificationInterface;
}>();
