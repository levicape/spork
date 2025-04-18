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
import {
	JwkCache,
	type JwkCacheInterface,
	JwkMutex,
} from "./JwkCache/JwkCache.mjs";

type JwtVerifyFnWithKey = typeof jwtVerify;
export type JwtVerifyFnJose = (
	jwt: Parameters<JwtVerifyFnWithKey>[0],
	options: Parameters<JwtVerifyFnWithKey>[2],
) => Promise<JWTVerifyResult<JWTPayload>>;

export type JwtVerificationInterface = {
	jwtVerify: JwtVerifyFnJose | null;
};

export class JwtVerification extends Context.Tag("JwtVerification")<
	JwtVerification,
	JwtVerificationInterface
>() {}

export const $$$JWT_VERIFICATION_JWKS_URI = "JWT_VERIFICATION_JWKS_URI";
export const $$$JWT_VERIFICATION_JWKS_CACHE_KEY =
	"JWT_VERIFICATION_JWKS_CACHE_KEY";
export class JwtVerificationJoseEnvs {
	constructor(
		readonly JWT_VERIFICATION_JWKS_URI?: string,
		readonly JWT_VERIFICATION_JWKS_CACHE_KEY?: string,
	) {}
}

export class JwtVerificationNoop implements JwtVerificationInterface {
	jwtVerify = null;
}

export class JwtVerificationJose {
	private jwks:
		| ReturnType<typeof createLocalJWKSet>
		| ReturnType<typeof createRemoteJWKSet>
		| undefined;
	private cache: JWKSCacheInput | undefined;

	constructor(
		private logger: ILogLayer,
		private context: JwtVerificationJoseEnvs,
		private jwkCache: JwkCacheInterface,
	) {}

	initialize = async (local: ExportedJWKSCache | null) => {
		if (this.context.JWT_VERIFICATION_JWKS_URI) {
			const { JWT_VERIFICATION_JWKS_URI } = this.context;
			this.jwks = await (async () => {
				if (JWT_VERIFICATION_JWKS_URI.startsWith("http")) {
					this.cache = await this.jwkCache.getJwks();
					return await this.jwksFromUrl(JWT_VERIFICATION_JWKS_URI);
				}

				if (JWT_VERIFICATION_JWKS_URI.startsWith("file")) {
					return await this.jwksFromFile(JWT_VERIFICATION_JWKS_URI);
				}
				throw new VError(
					`Unsupported JWK URL format: ${JWT_VERIFICATION_JWKS_URI}`,
				);
			})();
			return Promise.resolve();
		}
		if (local) {
			this.jwks = createLocalJWKSet(local.jwks);

			this.logger
				?.withMetadata({
					JwtVerificationJose: {
						local,
						context: this.context,
					},
				})
				.warn(
					`${$$$JWT_VERIFICATION_JWKS_URI} not provided, using generated key.
				To disable this behavior, set ${$$$JWT_VERIFICATION_JWKS_URI} to "unload"`,
				);
		}
	};

	private jwksFromFile = async (file: string) => {
		this.logger
			?.withMetadata({
				JwtVerificationJose: {
					context: this.context,
					file,
				},
			})
			.debug(`Using file ${$$$JWT_VERIFICATION_JWKS_URI}`);

		let content: unknown;
		let json: unknown;
		try {
			content = readFileSync(fileURLToPath(file), "utf-8");
			json = JSON.parse(content as string);
		} catch (e) {
			this.logger
				?.withMetadata({
					JwtVerificationJose: {
						context: this.context,
						file,
						content,
						json,
					},
				})
				.withError(e)
				.error("Failed to read JWK file");
			throw e;
		}
		const keyset = json as unknown as { keys: JWK[] };
		return createLocalJWKSet(keyset);
	};

	private jwksFromUrl = async (url: string) => {
		this.logger
			?.withMetadata({
				JwtVerificationJose: {
					context: this.context,
				},
			})
			.debug(`Using remote ${$$$JWT_VERIFICATION_JWKS_URI}`);

		return createRemoteJWKSet(new URL(url), {
			[jwksCache]: this.cache,
		});
	};

	public jwtVerify: JwtVerifyFnJose = async (jwt, options) => {
		if (this.jwks === undefined) {
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
export const JwtVerificationLayerConfig = Config.map(
	Config.all([
		Config.string($$$JWT_VERIFICATION_JWKS_URI).pipe(
			Config.map((c) => envsubst(c)),
			Config.withDescription(
				`Oauth jwks_uri. Supported protocols: ${SUPPORTED_PROTOCOLS.join(", ")}`,
			),
			Config.withDefault(undefined),
		),
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
		const mutex = yield* JwkMutex;
		const { ref, cache } = yield* mutex;

		logger
			.withMetadata({ JwtVerificationLayer: { config } })
			.debug("JwtVerificationLayer waiting mutex");

		const jwtVerify = yield* cache.withPermits(1)(
			Effect.gen(function* () {
				logger
					.withMetadata({ JwtVerificationLayer: { config } })
					.debug("JwtVerificationLayer with mutex");

				if (config?.JWT_VERIFICATION_JWKS_URI?.toLowerCase() === "unload") {
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
