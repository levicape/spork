import { Config, Effect, Ref } from "effect";
import { Service } from "effect/Effect";
import {
	type ExportedJWKSCache,
	exportJWK,
	generateKeyPair,
	generateSecret,
} from "jose";
import VError from "verror";
import { LoggingContext } from "../../logging/LoggingContext.mjs";
import { JwtSignatureLayerConfig } from "../JwtSignature.mjs";

const $$$JWK_LOCAL_SYNCHRONIZED_ALG = "JWK_LOCAL_SYNCHRONIZED_ALG";
const $$$JWK_LOCAL_SYNCHRONIZED_CRV = "JWK_LOCAL_SYNCHRONIZED_CRV";
const $$$JWK_LOCAL_SYNCHRONIZED_SECRET = "JWK_LOCAL_SYNCHRONIZED_SECRET";

const JWK_LOCAL_ALG = "ES256";
const JWK_LOCAL_CRV = "P-256";
const JWK_LOCAL_SECRET = "A256GCMKW";

/**
 * Configuration for the local synchronized JWK
 */
export class JwkLocalSynchronizedEnvs {
	constructor(
		/**
		 * Algorithm to use for the local synchronized JWK alg. Defaults to "ES256".
		 * @see {@link JWK_LOCAL_SYNCHRONIZED_ALG}
		 */
		readonly JWK_LOCAL_SYNCHRONIZED_ALG: string,
		/**
		 * Algorithm to use for the local synchronized JWK crv. Defaults to "P-256".
		 * @see {@link JWK_LOCAL_SYNCHRONIZED_CRV}
		 */
		readonly JWK_LOCAL_SYNCHRONIZED_CRV: string,
		/**
		 * Algorithm to use for the local synchronized JWK secret. Defaults to "A256GCMKW".
		 * @see {@link JWK_LOCAL_SYNCHRONIZED_SECRET}
		 */
		readonly JWK_LOCAL_SYNCHRONIZED_SECRET: string,
	) {}
}

export const JwkLocalSynchronizedConfig = Config.map(
	Config.all([
		Config.string($$$JWK_LOCAL_SYNCHRONIZED_ALG).pipe(
			Config.withDescription(
				`Algorithm to use for the local synchronized JWK alg. Defaults to "${JWK_LOCAL_ALG}".`,
			),
			Config.withDefault(JWK_LOCAL_ALG),
		),
		Config.string($$$JWK_LOCAL_SYNCHRONIZED_CRV).pipe(
			Config.withDescription(
				`Algorithm to use for the local synchronized JWK crv. Defaults to "${JWK_LOCAL_CRV}".`,
			),
			Config.withDefault(JWK_LOCAL_CRV),
		),
		Config.string($$$JWK_LOCAL_SYNCHRONIZED_SECRET).pipe(
			Config.withDescription(
				`Algorithm to use for the local synchronized JWK secret. Defaults to "${JWK_LOCAL_SECRET}".`,
			),
			Config.withDefault(JWK_LOCAL_SECRET),
		),
	]),
	([
		JWK_LOCAL_SYNCHRONIZED_ALG,
		JWK_LOCAL_SYNCHRONIZED_CRV,
		JWK_LOCAL_SYNCHRONIZED_SECRET,
	]) =>
		new JwkLocalSynchronizedEnvs(
			JWK_LOCAL_SYNCHRONIZED_ALG,
			JWK_LOCAL_SYNCHRONIZED_CRV,
			JWK_LOCAL_SYNCHRONIZED_SECRET,
		),
);

export class JwkLocalSynchronized extends Service<JwkLocalSynchronized>()(
	"JwkLocalSynchronized",
	{
		effect: Effect.cached(
			Effect.gen(function* () {
				const console = yield* LoggingContext;
				const logger = yield* console.logger;
				const {
					JWK_LOCAL_SYNCHRONIZED_ALG,
					JWK_LOCAL_SYNCHRONIZED_CRV,
					JWK_LOCAL_SYNCHRONIZED_SECRET,
				} = yield* JwkLocalSynchronizedConfig;
				const config = yield* JwtSignatureLayerConfig;

				let keypair: CryptoKeyPair | undefined;
				let secret: CryptoKey | undefined;
				let publicJwk: JsonWebKey | undefined;

				if (config?.JWT_SIGNATURE_JWK_URL?.toLowerCase() === "unload") {
					logger
						.withMetadata({ JwtVerificationLayer: { config } })
						.info("JwkLocalSynchronized not initialized due to URI = 'unload'");
				} else {
					keypair = yield* Effect.promise(() =>
						generateKeyPair(JWK_LOCAL_SYNCHRONIZED_ALG, {
							crv: JWK_LOCAL_SYNCHRONIZED_CRV,
							extractable: true,
						}),
					);

					const isKeypair = keypair;
					publicJwk = yield* Effect.promise(() =>
						exportJWK(isKeypair.publicKey),
					);

					const generatedSecret = yield* Effect.promise(() =>
						generateSecret(JWK_LOCAL_SYNCHRONIZED_SECRET, {
							extractable: true,
						}),
					);
					if (generatedSecret instanceof CryptoKey) {
						secret = generatedSecret;
					} else {
						logger
							.withMetadata({ JwkLocalSynchronized: { generatedSecret } })
							.error(
								"Failed to generate secret. It must be representable as a crypto.CryptoKey",
							);
						throw new VError("Failed to generate secret");
					}
				}

				return {
					keypair: keypair as typeof keypair | undefined,
					secret,
					ref: yield* Ref.make<ExportedJWKSCache | null>(
						publicJwk
							? {
									jwks: {
										keys: [publicJwk],
									},
									uat: Date.now(),
								}
							: null,
					),
					cache: yield* Effect.makeSemaphore(1),
				};
			}),
		),
	},
) {}
