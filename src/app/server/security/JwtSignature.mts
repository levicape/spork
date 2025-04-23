import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Config, Context, Effect, Layer } from "effect";
import {
	EncryptJWT,
	type EncryptOptions,
	type GenerateKeyPairResult,
	type JWK,
	type JWTDecryptOptions,
	type JWTDecryptResult,
	type JWTPayload,
	SignJWT,
	type SignOptions,
	importJWK,
	jwtDecrypt,
} from "jose";
import type { ILogLayer } from "loglayer";
import { deserializeError } from "serialize-error";
import VError from "verror";
import { z } from "zod";
import { envsubst } from "../EnvSubst.mjs";
import { LoggingContext } from "../logging/LoggingContext.mjs";
import { JwkLocalSynchronized } from "./JwkCache/JwkLocalSynchronized.mjs";
import { JwtVerificationJose } from "./JwtVerification.mjs";

export type JwtSignFnJose<Token extends JWTPayload> = (
	payload: Token,
	signer: (token: SignJWT) => SignJWT,
	options?: SignOptions,
) => Promise<string>;

export type JwtEncryptFnJose<Token extends JWTPayload> = (
	payload: Token,
	signer: (token: EncryptJWT) => EncryptJWT,
	options?: EncryptOptions,
) => Promise<string>;

export type JwtDecryptFnJose<Token extends JWTPayload> = (
	payload: string,
	options?: JWTDecryptOptions,
) => Promise<JWTDecryptResult<Token>>;

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
	 * JWT signing function. It does not call "setProtectedHeaders" or "setIssuedAt" by default.
	 * You can use the `initializeToken` function to set these values.
	 *
	 * @default JwtSignFnJose
	 * @see {@link JwtSignatureLayerConfig}
	 */
	sign: JwtSignFnJose<Token> | null;
	/**
	 * Initializer for tokens created by sign
	 */
	initializeToken?: (token: SignJWT) => SignJWT;
	/**
	 * JWT sign (private) key. Used for signing and decrypting
	 * @default undefined
	 */
	signKey?: Awaited<ReturnType<typeof importJWK>> | undefined;
	/**
	 * JWT encrypt function. It does not call "setProtectedHeaders" or "setIssuedAt" by default.
	 * You can use the `initializeMaterial` function to set these values.
	 *
	 * @default JwtEncryptFnJose
	 * @see {@link JwtSignatureLayerConfig}
	 */
	encrypt: JwtEncryptFnJose<Token> | null;
	/**
	 * Initializer for secret materials created by encrypt
	 */
	initializeMaterial?: (token: EncryptJWT) => EncryptJWT;
	/**
	 * JWT public key. Used for encrypting tokens
	 * @default undefined
	 */
	encryptKey?: Awaited<ReturnType<typeof importJWK>> | undefined;
	/**
	 * JWT decrypt function
	 */
	decrypt: JwtDecryptFnJose<Token> | null;
};

const JWK_SIGNATURE_ALG = "ES256";
const JWK_SIGNATURE_CRV = "P-256";
const JWK_ENCRYPTION_ALG = "A256GCM";
/**
 * @private Environment variable constant for JWT_SIGNATURE_JWK_URL
 */
export const $$$JWT_SIGNATURE_JWK_URL = "JWT_SIGNATURE_JWK_URL";
/**
 * @private Environment variable constant for JWT_ENCRYPTION_JWK_URL
 */
export const $$$JWT_ENCRYPTION_JWK_URL = "JWT_ENCRYPTION_JWK_URL";

export class JwtSignatureJoseEnvs {
	constructor(
		/**
		 * URL of JWK signing key. Supported protocols: file.
		 * The key must use the ES256 algorithm, use P-256 and be JWK formatted.
		 * @see {@link JwtSignatureJose}
		 */
		readonly JWT_SIGNATURE_JWK_URL?: string | undefined,
		/**
		 * URL of symmetric JWK for encryption/decryption. Supported protocols: file.
		 * The key must be valid for A256GCM algorithm and be JWK formatted.
		 * @see {@link JwtSignatureJose}
		 */
		readonly JWT_ENCRYPTION_JWK_URL?: string | undefined,
	) {}
}
/**
 * Effect tag for the JWT signature layer
 */
export class JwtSignature extends Context.Tag("JwtSignature")<
	JwtSignature,
	JwtSignatureInterface<JWTPayload>
>() {}

export class JwtSignatureNoop<Token extends JWTPayload>
	implements JwtSignatureInterface<Token>
{
	config = new JwtSignatureJoseEnvs();
	sign = null;
	encrypt = null;
	decrypt = null;
}

export class JwtSignatureJose {
	public signKey: Awaited<ReturnType<typeof importJWK>> | undefined;
	public encryptKey: Awaited<ReturnType<typeof importJWK>> | undefined;
	public initializeToken: ((token: SignJWT) => SignJWT) | undefined = undefined;
	public initializeMaterial: ((token: EncryptJWT) => EncryptJWT) | undefined =
		undefined;

	constructor(
		private logger: ILogLayer | undefined,
		public config: JwtSignatureJoseEnvs,
	) {}

	initialize = async (
		local: GenerateKeyPairResult | undefined,
		secret: CryptoKey | undefined,
	) => {
		if (this.config.JWT_SIGNATURE_JWK_URL) {
			const { JWT_SIGNATURE_JWK_URL, JWT_ENCRYPTION_JWK_URL } = this.config;
			this.signKey = await (async () => {
				if (JWT_SIGNATURE_JWK_URL.startsWith("file")) {
					return await this.importJwkCrypto(JWT_SIGNATURE_JWK_URL);
				}
				throw new VError(
					`Unsupported JWK format: ${JWT_SIGNATURE_JWK_URL}. Supported protocols: file \n
					Please verify ${$$$JWT_SIGNATURE_JWK_URL}`,
				);
			})();
			this.encryptKey = await (async () => {
				if (JWT_ENCRYPTION_JWK_URL?.startsWith("file")) {
					return await this.importJWKRing(JWT_ENCRYPTION_JWK_URL);
				}
				throw new VError(
					`Unsupported JWK format: ${JWT_ENCRYPTION_JWK_URL}. Supported protocols: file \n
					${$$$JWT_ENCRYPTION_JWK_URL} must be set and be a valid URL`,
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
				this.encryptKey = secret;
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

	private importJWKRing = async (file: string) => {
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

	public sign = async <Token extends JWTPayload>(
		payload: Token,
		configure: (result: SignJWT) => SignJWT,
		options?: SignOptions,
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
		return await configure(result).sign(this.signKey, options);
	};

	public encrypt = async <Token extends JWTPayload>(
		payload: Token,
		configure: (result: EncryptJWT) => EncryptJWT,
		options?: EncryptOptions,
	) => {
		if (this.encryptKey === undefined) {
			this.logger
				?.withMetadata({
					JwtSignatureJose,
				})
				.error("JwtSignatureJose not initialized");
			throw new VError("JwtSignatureJose not initialized");
		}

		let result = new EncryptJWT(payload);
		if (this.initializeMaterial) {
			result = this.initializeMaterial(result);
		}
		return await configure(result).encrypt(this.encryptKey, options);
	};

	public decrypt = async <Token extends JWTPayload>(
		payload: string,
		options?: JWTDecryptOptions,
	) => {
		if (this.encryptKey === undefined) {
			this.logger
				?.withMetadata({
					JwtSignatureJose,
				})
				.error("JwtSignatureJose not initialized");
			throw new VError("JwtSignatureJose not initialized");
		}
		return jwtDecrypt<Token>(payload, this.encryptKey, options);
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
		Config.string($$$JWT_ENCRYPTION_JWK_URL).pipe(
			Config.map((c) => envsubst(c)),
			Config.withDescription(
				`URL of symmetric JWK for encryption and decryption. Supported protocols: ${SUPPORTED_PROTOCOLS.join(
					", ",
				)}. The key should be using the ${JWK_ENCRYPTION_ALG} algorithm.`,
			),
			Config.withDefault(undefined),
		),
	]),
	([JWT_SIGNATURE_JWK_URL, JWT_ENCRYPTION_JWK_URL]) =>
		new JwtSignatureJoseEnvs(JWT_SIGNATURE_JWK_URL, JWT_ENCRYPTION_JWK_URL),
);

export const JwtSignatureLayer = Layer.effect(
	JwtSignature,
	Effect.gen(function* () {
		const console = yield* LoggingContext;
		const logger = yield* console.logger;
		const config = yield* JwtSignatureLayerConfig;
		const mutex = yield* JwkLocalSynchronized;
		const { cache, keypair, secret } = yield* mutex;

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
						return jwtSignature.initialize(keypair, secret);
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
