import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { Config, Context, Effect, Layer } from "effect";
import { type JWK, SignJWT, exportJWK, generateSecret, importJWK } from "jose";
import type { ILogLayer } from "loglayer";
import { deserializeError } from "serialize-error";
import VError from "verror";
import { z } from "zod";
import { envsubst } from "../EnvSubst.mjs";
import { LoggingContext } from "../logging/LoggingContext.mjs";
import { JwkCacheLocalStorage } from "./JwkCache/JwkCache.mjs";

export type JwtSignFnJose = (
	signer: (token: SignJWT) => SignJWT,
) => Promise<string>;

export type JwtSignatureInterface = {
	jwtSign: JwtSignFnJose | null;
	initializeToken?: (token: SignJWT) => SignJWT;
};

export class JwtSignature extends Context.Tag("JwtSignature")<
	JwtSignature,
	JwtSignatureInterface
>() {}

export const $$$JWT_SIGNATURE_JWKS_URI = "JWT_SIGNATURE_JWKS_URI";
export const $$$JWT_SIGNATURE_JWKS_CACHE_KEY = "JWT_SIGNATURE_JWKS_CACHE_KEY";
export class JwtSignatureJoseEnvs {
	constructor(readonly JWT_SIGNATURE_JWKS_URI: string | undefined) {}
}

export class JwtSignatureNoop implements JwtSignatureInterface {
	jwtSign = null;
}

export class JwtSignatureJose {
	private jwks: Awaited<ReturnType<typeof importJWK>> | undefined;
	public initializeToken: ((token: SignJWT) => SignJWT) | undefined = undefined;

	constructor(
		private logger: ILogLayer,
		private context: JwtSignatureJoseEnvs,
	) {}

	initialize = async () => {
		if (this.context.JWT_SIGNATURE_JWKS_URI) {
			const { JWT_SIGNATURE_JWKS_URI } = this.context;
			this.jwks = await (async () => {
				if (JWT_SIGNATURE_JWKS_URI.startsWith("file")) {
					return this.importJWK(JWT_SIGNATURE_JWKS_URI);
				}
				throw new VError(
					`Unsupported JWK format: ${JWT_SIGNATURE_JWKS_URI}. Supported protocols: file`,
				);
			})();
		} else {
			const local = JwkCacheLocalStorage.getStore();
			if (local?.jwks?.keys?.[0]) {
				this.logger
					.withMetadata({
						JwtSignatureJose: {
							context: this.context,
							jwks: local.jwks.keys,
						},
					})
					.info(`Using local JWK cache`);
				this.jwks = await importJWK(local.jwks.keys[0]);
				return;
			}

			const defaultKey: CryptoKey = (await generateSecret("HS512", {
				extractable: true,
			})) as CryptoKey;
			this.jwks = defaultKey;

			const exported = await exportJWK(defaultKey);
			JwkCacheLocalStorage.enterWith({
				jwks: {
					keys: [exported],
				},
				uat: Date.now(),
			});

			this.logger
				.withMetadata({
					JwtSignatureJose: {
						context: this.context,
						key: inspect(defaultKey),
					},
				})
				.warn(
					`${$$$JWT_SIGNATURE_JWKS_URI} not provided, using generated key.
										To disable this behavior, set ${$$$JWT_SIGNATURE_JWKS_URI} to "unload"`,
				);
		}
	};

	private importJWK = async (file: string) => {
		this.logger
			.withMetadata({
				JwtSignatureJose: {
					context: this.context,
					file,
				},
			})
			.debug(`Using file ${$$$JWT_SIGNATURE_JWKS_URI}`);

		let content: unknown;
		let json: unknown;
		try {
			content = await readFile(fileURLToPath(file), "utf-8");
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
				.withMetadata({
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
		return importJWK(json as unknown as JWK);
	};

	public jwtSign: JwtSignFnJose = (payload) => {
		if (this.jwks === undefined) {
			this.logger
				.withMetadata({
					JwtSignatureJose,
				})
				.error("JwtSignatureJose not initialized");
			throw new VError("JwtSignatureJose not initialized");
		}

		const jwks = this.jwks;
		let result = new SignJWT();
		if (this.initializeToken) {
			result = this.initializeToken(result);
		}
		return payload(result).sign(jwks);
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
		logger
			.withMetadata({ JwtSignatureLayer: { config } })
			.debug("JwtSignatureLayer");

		if (config?.JWT_SIGNATURE_JWKS_URI?.toLowerCase() === "unload") {
			logger
				.withMetadata({ JwtSignatureLayer: { config } })
				.info("JwtSignatureLayer not loaded due to URI = 'unload'");
			return new JwtSignatureNoop();
		}

		const jwtSignature = new JwtSignatureJose(logger, config);
		try {
			yield* Effect.promise(() => jwtSignature.initialize());
		} catch (error) {
			logger
				.withMetadata({ JwtSignatureLayer: { error } })
				.withError(deserializeError(error))
				.error("Failed to initialize JwtLayer");
		}
		return jwtSignature;
	}),
);

export const JwtSignatureAsyncLocalStorage = new AsyncLocalStorage<{
	JwtSignature: JwtSignatureInterface;
}>();
