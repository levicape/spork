import { Config, Effect, Layer, Ref } from "effect";
import { Service } from "effect/Effect";
import { type ExportedJWKSCache, exportJWK, generateKeyPair } from "jose";
import { ConsoleTransport, type ILogLayer } from "loglayer";
import { type Storage, createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";
import { LoggingContext } from "../../logging/LoggingContext.mjs";

type ActualFsDriver = typeof fsDriver.default;
const fs = fsDriver as unknown as ActualFsDriver;

export interface JwkCacheInterface {
	readonly getJwks: () => Promise<ExportedJWKSCache>;
	readonly setJwks: (keys: ExportedJWKSCache) => Promise<void>;
}

export class JwkCache extends Effect.Tag("JwkCache")<
	"JwkCache",
	{ cache: (keyringName: string) => JwkCacheInterface }
>() {}

export class JwkCacheFilesystemEnvs {
	constructor(
		readonly JWK_CACHE_DEBUG: boolean,
		readonly JWK_CACHE_FS_ROOT: string,
		readonly JWK_CACHE_FS_TTL_SECONDS: number,
	) {}
}

export class JwkCacheFilesystem {
	public store: Storage;
	private previousUat: number | undefined;

	constructor(
		private logger: ILogLayer,
		private readonly context: JwkCacheFilesystemEnvs,
		private readonly keyringName: string,
	) {
		this.logger.withContext({
			JwkCache: {
				fsRoot: this.context.JWK_CACHE_FS_ROOT,
				fsTTL: this.context.JWK_CACHE_FS_TTL_SECONDS,
			},
		});
		this.store = createStorage({
			driver: fs({
				base: this.context.JWK_CACHE_FS_ROOT,
				noClear: true,
			}),
		});
	}

	public getJwks = async () => {
		const keys = await this.store.getItem<ExportedJWKSCache>(this.keyringName);
		if (keys?.uat) {
			const previousUat = this.previousUat;
			this.previousUat = keys.uat;
			const age = Date.now() - keys.uat;

			this.logger
				.withMetadata({
					getJwks: {
						age: age,
						uat: keys.uat,
						jwks: keys.jwks.keys.length,
						previousUat,
					},
				})
				.debug(`Existing JWK cache found`);

			if (age > this.context.JWK_CACHE_FS_TTL_SECONDS * 1000) {
				await this.deleteJwks();
				return {} as ExportedJWKSCache;
			}
		}
		return keys ?? ({} as ExportedJWKSCache);
	};

	public setJwks = async (keys: ExportedJWKSCache) => {
		if (keys.uat === this.previousUat) {
			return;
		}
		this.logger
			.withMetadata({
				setJwks: {
					uat: keys.uat,
					jwks: keys.jwks.keys.length,
					previousUat: this.previousUat,
				},
			})
			.debug(`Setting JWK cache`);

		await this.store.setItem<ExportedJWKSCache>(this.keyringName, keys);
	};

	public deleteJwks = async () => {
		this.logger
			.withMetadata({
				deleteJwks: {
					previousUat: this.previousUat,
				},
			})
			.debug(`Deleting JWK cache`);
		this.previousUat = undefined;
		await this.store.removeItem(this.keyringName);
	};
}

export const FilesystemJwkCacheConfig = Config.map(
	Config.all([
		Config.boolean("JWK_CACHE_DEBUG").pipe(
			Config.withDescription("Emit debug logs"),
			Config.withDefault(true),
		),
		Config.string("JWK_CACHE_FS_ROOT").pipe(
			Config.withDescription("Path to the root directory for the JWK cache"),
			Config.withDefault("/tmp"),
		),
		Config.number("JWK_CACHE_FS_TTL_SECONDS").pipe(
			Config.withDescription("Time to live for the JWK cache in seconds"),
			Config.withDefault(60),
		),
	]),
	([JWK_CACHE_DEBUG, JWK_CACHE_FS_ROOT, JWK_CACHE_FS_TTL_SECONDS]) =>
		new JwkCacheFilesystemEnvs(
			JWK_CACHE_DEBUG,
			JWK_CACHE_FS_ROOT,
			JWK_CACHE_FS_TTL_SECONDS,
		),
);
const globalConsole = globalThis.console;
export const FilesystemJwkCache = Layer.effect(
	JwkCache,
	Effect.gen(function* () {
		const console = yield* LoggingContext;
		const logger = yield* console.logger;
		const context = yield* FilesystemJwkCacheConfig;
		if (!context.JWK_CACHE_DEBUG) {
			logger.withFreshTransports([
				new ConsoleTransport({
					enabled: false,
					logger: globalConsole,
				}),
			]);
		}

		const cache = (key: string) => new JwkCacheFilesystem(logger, context, key);
		return {
			cache,
		};
	}),
);

export class JwkMutex extends Service<JwkMutex>()("JwkMutex", {
	effect: Effect.cached(
		Effect.gen(function* () {
			const keypair = yield* Effect.promise(() => generateKeyPair("RS512"));
			const publicJwk = yield* Effect.promise(() =>
				exportJWK(keypair.publicKey),
			);
			return {
				keypair,
				ref: yield* Ref.make<ExportedJWKSCache | null>({
					jwks: {
						keys: [publicJwk],
					},
					uat: Date.now(),
				}),
				cache: yield* Effect.makeSemaphore(1),
			};
		}),
	),
}) {}
