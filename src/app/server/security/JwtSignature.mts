import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Config, Context, Effect, Layer } from "effect";
import {
	type GenerateKeyPairResult,
	type JWK,
	type JWTPayload,
	SignJWT,
	importJWK,
} from "jose";
import type { ILogLayer } from "loglayer";
import { deserializeError } from "serialize-error";
import VError from "verror";
import { z } from "zod";
import { envsubst } from "../EnvSubst.mjs";
import { LoggingContext } from "../logging/LoggingContext.mjs";
import { JwkLocalSynchronized } from "./JwkCache/JwkLocalSynchronized.mjs";
import {
	JwtVerificationJose,
	JwtVerificationJwksUrlConfig,
} from "./JwtVerification.mjs";

export type JwtSignFnJose<Token extends JWTPayload> = (
	payload: Token,
	signer: (token: SignJWT) => SignJWT,
) => Promise<string>;

/**
 * Provides JWT signing functionality via `jose`
 */
export type JwtSignatureInterface<Token extends JWTPayload> = {
	/**
	 * Resolved configuration
	 * @see {@link JwtSignatureJoseEnvs}
	 */
	config: JwtSignatureJoseEnvs;
	/**
	 * JWT signing function.
	 * @default JwtSignFnJose
	 * @see {@link JwtSignatureLayerConfig}
	 */
	jwtSign: JwtSignFnJose<Token> | null;
	/**
	 * JWT sign (private) key. Used for signing and decrypting
	 * @default undefined
	 */
	signKey?: Awaited<ReturnType<typeof importJWK>> | undefined;
	/**
	 * JWT public key. Used for encrypting
	 * @default undefined
	 */
	encryptKey?: Awaited<ReturnType<typeof importJWK>> | undefined;
	/**
	 * Initializer for new tokens
	 */
	initializeToken?: (token: SignJWT) => SignJWT;
};

const JWK_SIGNATURE_ALG = "ES256";
const JWK_SIGNATURE_CRV = "P-256";
/**
 * @private Environment variable constant for JWT_SIGNATURE_JWK_URL
 */
export const $$$JWT_SIGNATURE_JWK_URL = "JWT_SIGNATURE_JWK_URL";
export class JwtSignatureJoseEnvs {
	constructor(
		/**
		 * URL of JWK signing key. Supported protocols: file.
		 * The key must use the ES256 algorithm, use P-256 and be JWK formatted.
		 * @see {@link JwtSignatureJose}
		 */
		readonly JWT_SIGNATURE_JWK_URL?: string | undefined,
		/**
		 * URL of JWK verify key. Supported protocols: file.
		 * @see {@link JwtSignatureJose}
		 */
		readonly JWT_VERIFICATION_JWKS_URL?: string | undefined,
	) {}
}
/**
 * Effect tag for the JWT signature layer
 */
export class JwtSignature extends Context.Tag("JwtSignature")<
	JwtSignature,
	JwtSignatureInterface<JWTPayload>
>() {}

export class JwtSignatureNoop implements JwtSignatureInterface<JWTPayload> {
	config = new JwtSignatureJoseEnvs();
	jwtSign = null;
}

export class JwtSignatureJose {
	public signKey: Awaited<ReturnType<typeof importJWK>> | undefined;
	public encryptKey: Awaited<ReturnType<typeof importJWK>> | undefined;
	public initializeToken: ((token: SignJWT) => SignJWT) | undefined = undefined;

	constructor(
		private logger: ILogLayer | undefined,
		public config: JwtSignatureJoseEnvs,
	) {}

	initialize = async (local: GenerateKeyPairResult | undefined) => {
		if (this.config.JWT_SIGNATURE_JWK_URL) {
			const { JWT_SIGNATURE_JWK_URL, JWT_VERIFICATION_JWKS_URL } = this.config;
			this.signKey = await (async () => {
				if (JWT_SIGNATURE_JWK_URL.startsWith("file")) {
					return await this.importJwkCrypto(JWT_SIGNATURE_JWK_URL);
				}
				throw new VError(
					`Unsupported JWK format: ${JWT_SIGNATURE_JWK_URL}. Supported protocols: file`,
				);
			})();
			this.encryptKey = await (async () => {
				if (JWT_VERIFICATION_JWKS_URL?.startsWith("file")) {
					return await this.imporkJWKRing(JWT_VERIFICATION_JWKS_URL);
				}
				throw new VError(
					`Unsupported JWK format: ${JWT_VERIFICATION_JWKS_URL}. Supported protocols: file`,
				);
			})();
		} else {
			if (local) {
				this.logger
					?.withMetadata({
						JwtSignatureJose: {
							local,
							context: this.config,
						},
					})
					.warn(
						`${$$$JWT_SIGNATURE_JWK_URL} not provided, using generated key.
										To disable this behavior, set ${$$$JWT_SIGNATURE_JWK_URL} to "unload"`,
					);
				this.signKey = local.privateKey;
				this.encryptKey = local.publicKey;
			}
		}
	};

	private importJwkCrypto = async (file: string) => {
		this.logger
			?.withMetadata({
				JwtSignatureJose: {
					context: this.config,
					file,
				},
			})
			.debug(`Using file ${file}`);

		let content: unknown;
		let json: unknown;
		try {
			content = readFileSync(fileURLToPath(file), "utf-8");
			json = JSON.parse(content as string);
			const JwkZod = z.strictObject({
				kty: z.string(),
				alg: z.string(),
				kid: z.string(),
				use: z.string(),
				n: z.string(),
				e: z.string(),
			});
			JwkZod.parse(json);
		} catch (e) {
			this.logger
				?.withMetadata({
					JwtSignatureJose: {
						context: this.config,
						file,
						content,
						json,
					},
				})
				.withError(e)
				.error("Failed to read JWK file");
			throw e;
		}
		return await importJWK(json as unknown as JWK);
	};

	private imporkJWKRing = async (file: string) => {
		this.logger
			?.withMetadata({
				JwtSignatureJose: {
					context: this.config,
					file,
				},
			})
			.debug(`Using file ${$$$JWT_SIGNATURE_JWK_URL}`);

		try {
			const keyset = await JwtVerificationJose.readJwksFile(file);
			return await importJWK(keyset.keys.find(() => true) as unknown as JWK);
		} catch (e) {
			this.logger
				?.withMetadata({
					JwtSignatureJose: {
						context: this.config,
						file,
					},
				})
				.withError(e)
				.error("Failed to read JWK file");
			throw e;
		}
	};

	public jwtSign = async <Token extends JWTPayload>(
		payload: Token,
		signer: (result: SignJWT) => SignJWT,
	) => {
		if (this.signKey === undefined) {
			this.logger
				?.withMetadata({
					JwtSignatureJose,
				})
				.error("JwtSignatureJose not initialized");
			throw new VError("JwtSignatureJose not initialized");
		}

		let result = new SignJWT(payload);
		if (this.initializeToken) {
			result = this.initializeToken(result);
		}
		return await signer(result).sign(this.signKey);
	};
}

export const SUPPORTED_PROTOCOLS = ["file"] as const;
export const JwtSignatureLayerConfig = Config.map(
	Config.all([
		Config.string($$$JWT_SIGNATURE_JWK_URL).pipe(
			Config.map((c) => envsubst(c)),
			Config.withDescription(
				`URL of JWK signing key. Supported protocols: ${SUPPORTED_PROTOCOLS.join(", ")}. The key must use the ${JWK_SIGNATURE_ALG} algorithm and ${JWK_SIGNATURE_CRV} curve.`,
			),
			Config.withDefault(undefined),
		),
		JwtVerificationJwksUrlConfig,
	]),
	([JWT_SIGNATURE_JWK_URL, JWT_VERIFICATION_JWKS_URL]) =>
		new JwtSignatureJoseEnvs(JWT_SIGNATURE_JWK_URL, JWT_VERIFICATION_JWKS_URL),
);

export const JwtSignatureLayer = Layer.effect(
	JwtSignature,
	Effect.gen(function* () {
		const console = yield* LoggingContext;
		const logger = yield* console.logger;
		const config = yield* JwtSignatureLayerConfig;
		const mutex = yield* JwkLocalSynchronized;
		const { cache, keypair } = yield* mutex;

		logger
			.withMetadata({ JwtSignatureLayer: { config } })
			.debug("JwtSignatureLayer waiting mutex");

		return yield* cache.withPermits(1)(
			Effect.gen(function* () {
				logger
					.withMetadata({ JwtSignatureLayer: { config } })
					.debug("JwtSignatureLayer with mutex");

				if (config?.JWT_SIGNATURE_JWK_URL?.toLowerCase() === "unload") {
					logger
						.withMetadata({ JwtSignatureLayer: { config } })
						.info("JwtSignatureLayer not loaded due to URI = 'unload'");
					return new JwtSignatureNoop();
				}

				const jwtSignature = new JwtSignatureJose(logger, config);
				yield* Effect.tryPromise({
					try: async () => {
						logger.debug("JwtSignatureLayer initializing");
						return jwtSignature.initialize(keypair);
					},
					catch: (error) => {
						logger
							.withMetadata({ JwtSignatureLayer: { error } })
							.withError(deserializeError(error))
							.error("Failed to initialize JwtSignatureLayer");
					},
				});
				return jwtSignature;
			}),
		);
	}),
);

export const JwtSignatureAsyncLocalStorage = new AsyncLocalStorage<{
	JwtSignature: JwtSignatureInterface<JWTPayload>;
}>();
