import { Config, Effect, Ref } from "effect";
import { Service } from "effect/Effect";
import { type ExportedJWKSCache, exportJWK, generateKeyPair } from "jose";
import { LoggingContext } from "../../logging/LoggingContext.mjs";
import { JwtSignatureLayerConfig } from "../JwtSignature.mjs";

const $$$JWK_LOCAL_SYNCHRONIZED_ALG = "JWK_LOCAL_SYNCHRONIZED_ALG";
const $$$JWK_LOCAL_SYNCHRONIZED_CRV = "JWK_LOCAL_SYNCHRONIZED_CRV";
export class JwkLocalSynchronizedEnvs {
	constructor(
		readonly JWK_LOCAL_SYNCHRONIZED_ALG: string,
		readonly JWK_LOCAL_SYNCHRONIZED_CRV: string,
	) {}
}

export const JwkLocalSynchronizedConfig = Config.map(
	Config.all([
		Config.string($$$JWK_LOCAL_SYNCHRONIZED_ALG).pipe(
			Config.withDescription(
				`Algorithm to use for the local synchronized JWK alg. Defaults to "ES256".`,
			),
			Config.withDefault("ES256"),
		),
		Config.string($$$JWK_LOCAL_SYNCHRONIZED_CRV).pipe(
			Config.withDescription(
				`Algorithm to use for the local synchronized JWK crv. Defaults to "P-256".`,
			),
			Config.withDefault("P-256"),
		),
	]),
	([JWK_LOCAL_SYNCHRONIZED_ALG, JWK_LOCAL_SYNCHRONIZED_CRV]) =>
		new JwkLocalSynchronizedEnvs(
			JWK_LOCAL_SYNCHRONIZED_ALG,
			JWK_LOCAL_SYNCHRONIZED_CRV,
		),
);

export class JwkLocalSynchronized extends Service<JwkLocalSynchronized>()(
	"JwkLocalSynchronized",
	{
		effect: Effect.cached(
			Effect.gen(function* () {
				const console = yield* LoggingContext;
				const logger = yield* console.logger;
				const { JWK_LOCAL_SYNCHRONIZED_ALG, JWK_LOCAL_SYNCHRONIZED_CRV } =
					yield* JwkLocalSynchronizedConfig;
				const config = yield* JwtSignatureLayerConfig;

				let keypair: CryptoKeyPair | undefined;
				let publicJwk: JsonWebKey | undefined;
				if (config?.JWT_SIGNATURE_JWKS_URI?.toLowerCase() === "unload") {
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
				}

				return {
					keypair: keypair as typeof keypair | undefined,
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
