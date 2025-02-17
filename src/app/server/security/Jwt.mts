import { Context, Effect, Layer } from "effect";
import type { JwtPayload } from "jsonwebtoken";
import * as jwt from "jsonwebtoken";
import type { ILogLayer } from "loglayer";
import { deserializeError } from "serialize-error";
import VError from "verror";
import type { IKeyValueStore } from "../client/kv/IKeyValueStore.js";
import { MemoryKV } from "../client/kv/IKeyValueStore.mock.js";
import { SecretsManager } from "../client/kv/aws/SecretsManager.js";
import {
	type ServerJwtConfig,
	SporkServerJwtConfig,
} from "../config/ServerJwtConfig.mjs";
import { LoggingContext } from "../logging/LoggingContext.mjs";
import { LoginToken } from "./model/LoginToken.js";
import type { SecurityAudience } from "./model/Security.js";

const jwtSign = jwt.sign;
const jwtVerify = jwt.verify;

export interface JwtToolsKey {
	material: string;
	manager: IKeyValueStore<string>;
}

export class JwtTools {
	signKey?: JwtToolsKey;
	verifyKey?: JwtToolsKey;

	static SUPPORTED_PROTOCOLS = {
		ssm: ({ region }: ServerJwtConfig) => {
			if (region !== null) {
				return new SecretsManager(region);
			}
			throw new VError("Region not found");
		},
	};

	constructor(
		private logger: ILogLayer,
		private context: ServerJwtConfig,
	) {}

	connect = (key: string): IKeyValueStore<string> => {
		let manager: IKeyValueStore<string> | undefined;
		Object.entries(JwtTools.SUPPORTED_PROTOCOLS).forEach(
			([protocol, factory]) => {
				if (manager !== undefined) {
					return;
				}
				if (key.startsWith(`${protocol}:`)) {
					manager = factory(this.context);
				}
			},
		);

		if (manager === undefined) {
			this.logger
				.withMetadata({
					JwtTools: {
						unsupported: key,
					},
				})
				.warn("Unsupported key protocol");
		}

		return manager ?? new MemoryKV();
	};

	initialize = async (context?: ServerJwtConfig): Promise<void> => {
		if (context) {
			this.context = context;
		}

		if (this.signKey !== undefined) {
			return Promise.resolve();
		}
		const { region, jwtPrivateKeyParameterName } = this.context;

		// TODO: Public only
		if (jwtPrivateKeyParameterName) {
			const manager = this.connect(jwtPrivateKeyParameterName);
			const material = await manager.get(jwtPrivateKeyParameterName);
			if (material.length > 0) {
				this.signKey = {
					manager,
					material,
				};
				this.logger
					.withMetadata({
						JwtTools: {
							region,
							secret: {
								jwtPrivateKeyParameterName: jwtPrivateKeyParameterName,
								length: material.length,
							},
							signKey: {
								manager: this.signKey?.manager.constructor.name,
								material: this.signKey?.material,
							},
						},
					})
					.info("Jwt signing key loaded");
			} else {
				throw new VError("AUTH_NOT_INITIALIZED");
			}
		} else {
			this.signKey = {
				manager: new MemoryKV(),
				material: "ev04QPaIMZ4QfGG33ZtqjOzgvYXZ22DH",
			};

			this.logger
				.withMetadata({
					JwtTools: {
						signKey: {
							manager: this.signKey?.manager.constructor.name,
							material: this.signKey?.material,
						},
					},
				})
				.warn("Jwt signing key not found, using default");
		}
	};

	async generateLogin(loginToken: LoginToken): Promise<string> {
		const { role, id, host, created, expires } = loginToken;
		await this.initialize();
		return jwtSign(
			{
				role: role,
				sub: id,
				iss: host,
				iat: Math.round(Number.parseInt(created) / 1000),
				exp: Math.round(Number.parseInt(expires) / 1000),
				aud: "ACCESS" as SecurityAudience,
			},
			this.signKey?.material ?? "",
			{
				algorithm: "HS512",
			},
		);
	}

	async generateRefresh(id: string): Promise<string> {
		await this.initialize();
		return jwtSign(
			{
				sub: id,
				iss: LoginToken.getIssuer(),
				aud: "REFRESH" as SecurityAudience,
			},
			this.signKey?.material ?? "",
			{
				algorithm: "HS512",
				noTimestamp: true,
			},
		);
	}

	async verify(jwt: string, audience: SecurityAudience): Promise<JwtPayload> {
		await this.initialize();

		// TODO: Catch and verify with previous secret to support rotation
		return jwtVerify(jwt, this.signKey?.material ?? "", {
			algorithms: ["HS512"],
			issuer: LoginToken.getIssuer(),
			audience,
		}) as JwtPayload;
	}
}

export class Jwt extends Context.Tag("Jwt")<
	Jwt,
	{ readonly jwtTools: JwtTools }
>() {}

export const JwtLayer = Layer.effect(
	Jwt,
	Effect.gen(function* () {
		const console = yield* LoggingContext;
		const logger = yield* console.logger;
		const context = yield* SporkServerJwtConfig;
		logger.withMetadata({ JwtLayer: { context } }).debug("JwtLayer");

		const jwtTools = new JwtTools(logger, context);
		try {
			yield* Effect.promise(() => jwtTools.initialize());
		} catch (error) {
			logger
				.withMetadata({ JwtLayer: { error } })
				.withError(deserializeError(error))
				.error("Failed to initialize JwtLayer");
		}
		return { jwtTools };
	}),
);
