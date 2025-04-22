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

export type JwtSignFnJose<Token extends JWTPayload> = (
	payload: Token,
	signer: (token: SignJWT) => SignJWT,
) => Promise<string>;

export type JwtSignatureInterface<Token extends JWTPayload> = {
	/**
	 * Resolved configuration
	 * @see {@link JwtSignatureJoseEnvs}
	 */
	config: JwtSignatureJoseEnvs;
	/**
	 * The JWT signing function.
	 * @default JwtSignatureJose
	 * @see {@link JwtSignatureLayerConfig}
	 */
	jwtSign: JwtSignFnJose<Token> | null;
	/**
	 * The JWT sign (private) key
	 * @default undefined
	 */
	signKey?: Awaited<ReturnType<typeof importJWK>> | undefined;
	/**
	 * Initializer for new tokens
	 */
	initializeToken?: (token: SignJWT) => SignJWT;
};

export class JwtSignature extends Context.Tag("JwtSignature")<
	JwtSignature,
	JwtSignatureInterface<JWTPayload>
>() {}

export const $$$JWT_SIGNATURE_JWKS_URI = "JWT_SIGNATURE_JWKS_URI";
export class JwtSignatureJoseEnvs {
	constructor(readonly JWT_SIGNATURE_JWKS_URI?: string | undefined) {}
}

export class JwtSignatureNoop implements JwtSignatureInterface<JWTPayload> {
	config = new JwtSignatureJoseEnvs();
	jwtSign = null;
}

export class JwtSignatureJose {
	public signKey: Awaited<ReturnType<typeof importJWK>> | undefined;
	public initializeToken: ((token: SignJWT) => SignJWT) | undefined = undefined;

	constructor(
		private logger: ILogLayer | undefined,
		public config: JwtSignatureJoseEnvs,
	) {}

	initialize = async (local: GenerateKeyPairResult | undefined) => {
		if (this.config.JWT_SIGNATURE_JWKS_URI) {
			const { JWT_SIGNATURE_JWKS_URI } = this.config;
			this.signKey = await (async () => {
				if (JWT_SIGNATURE_JWKS_URI.startsWith("file")) {
					return await this.importJWK(JWT_SIGNATURE_JWKS_URI);
				}
				throw new VError(
					`Unsupported JWK format: ${JWT_SIGNATURE_JWKS_URI}. Supported protocols: file`,
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
						`${$$$JWT_SIGNATURE_JWKS_URI} not provided, using generated key.
										To disable this behavior, set ${$$$JWT_SIGNATURE_JWKS_URI} to "unload"`,
					);
				this.signKey = local.privateKey;
			}
		}
	};

	private importJWK = async (file: string) => {
		this.logger
			?.withMetadata({
				JwtSignatureJose: {
					context: this.config,
					file,
				},
			})
			.debug(`Using file ${$$$JWT_SIGNATURE_JWKS_URI}`);

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
		Config.string($$$JWT_SIGNATURE_JWKS_URI).pipe(
			Config.map((c) => envsubst(c)),
			Config.withDescription(
				`Location of signing key in JWK format. Supported protocols: ${SUPPORTED_PROTOCOLS.join(", ")}`,
			),
			Config.withDefault(undefined),
		),
	]),

	([JWT_SIGNATURE_JWKS_URI]) =>
		new JwtSignatureJoseEnvs(JWT_SIGNATURE_JWKS_URI),
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
			.withMetadata({ JwtVerificationLayer: { config } })
			.debug("JwtSignatureLayer waiting mutex");

		return yield* cache.withPermits(1)(
			Effect.gen(function* () {
				logger
					.withMetadata({ JwtVerificationLayer: { config } })
					.debug("JwtSignatureLayer with mutex");

				if (config?.JWT_SIGNATURE_JWKS_URI?.toLowerCase() === "unload") {
					logger
						.withMetadata({ JwtVerificationLayer: { config } })
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
