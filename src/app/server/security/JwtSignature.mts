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
import { JwkMutex } from "./JwkCache/JwkCache.mjs";

export type JwtSignFnJose<Token extends JWTPayload> = (
	payload: Token,
	signer: (token: SignJWT) => SignJWT,
) => Promise<string>;

export type JwtSignatureInterface<Token extends JWTPayload> = {
	jwtSign: JwtSignFnJose<Token> | null;
	initializeToken?: (token: SignJWT) => SignJWT;
};

export class JwtSignature extends Context.Tag("JwtSignature")<
	JwtSignature,
	JwtSignatureInterface<JWTPayload>
>() {}

export const $$$JWT_SIGNATURE_JWKS_URI = "JWT_SIGNATURE_JWKS_URI";
export const $$$JWT_SIGNATURE_JWKS_CACHE_KEY = "JWT_SIGNATURE_JWKS_CACHE_KEY";
export class JwtSignatureJoseEnvs {
	constructor(readonly JWT_SIGNATURE_JWKS_URI: string | undefined) {}
}

export class JwtSignatureNoop implements JwtSignatureInterface<JWTPayload> {
	jwtSign = null;
}

export class JwtSignatureJose {
	private signKey: Awaited<ReturnType<typeof importJWK>> | undefined;
	public initializeToken: ((token: SignJWT) => SignJWT) | undefined = undefined;

	constructor(
		private logger: ILogLayer | undefined,
		private context: JwtSignatureJoseEnvs,
	) {}

	initialize = async (local: GenerateKeyPairResult) => {
		if (this.context.JWT_SIGNATURE_JWKS_URI) {
			const { JWT_SIGNATURE_JWKS_URI } = this.context;
			this.signKey = await (async () => {
				if (JWT_SIGNATURE_JWKS_URI.startsWith("file")) {
					return await this.importJWK(JWT_SIGNATURE_JWKS_URI);
				}
				throw new VError(
					`Unsupported JWK format: ${JWT_SIGNATURE_JWKS_URI}. Supported protocols: file`,
				);
			})();
		}
		this.signKey = local.privateKey;

		this.logger
			?.withMetadata({
				JwtSignatureJose: {
					local: local ?? {},
					context: this.context,
					key: this.signKey,
				},
			})
			.warn(
				`${$$$JWT_SIGNATURE_JWKS_URI} not provided, using generated key.
									To disable this behavior, set ${$$$JWT_SIGNATURE_JWKS_URI} to "unload"`,
			);
	};

	private importJWK = async (file: string) => {
		this.logger
			?.withMetadata({
				JwtSignatureJose: {
					context: this.context,
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

		const jwks = this.signKey;
		let result = new SignJWT(payload);
		if (this.initializeToken) {
			result = this.initializeToken(result);
		}
		return await signer(result).sign(jwks);
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
		const mutex = yield* JwkMutex;
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
