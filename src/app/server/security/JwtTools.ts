import * as jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { IKeyValueStore } from "../client/kv/IKeyValueStore.js";
import { MemoryKV } from "../client/kv/IKeyValueStore.mock.js";
import { SecretsManager } from "../client/kv/aws/SecretsManager.js";
import { ServerContext } from "../context/ServerContext.js";
import { Logger } from "../logging/Logger.js";
import { LoginToken } from "./model/LoginToken.js";
import type { SecurityAudience } from "./model/Security.js";

const jwtSign = jwt.sign;
const jwtVerify = jwt.verify;

const load = () => {
	const { jwtPrivateKeyParameterName, region } =
		ServerContext.fromEnvironmentVariables();
	return { jwtPrivateKeyParameterName, region };
};

export interface JwtToolsContext {
	jwtPrivateKey?: string;
	jwtPublicKey?: string;
	region?: string;
}

export interface JwtToolsKey {
	material: string;
	manager: IKeyValueStore<string>;
}

export class JwtTools {
	signKey?: JwtToolsKey;
	verifyKey?: JwtToolsKey;

	static SUPPORTED_PROTOCOLS = {
		ssm: ({ region }: JwtToolsContext) => {
			if (region !== undefined) {
				return new SecretsManager(region);
			}
			throw new Error("Region not found");
		},
	};

	constructor(private context: JwtToolsContext = load()) {}

	connect(key: string): IKeyValueStore<string> {
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
			Logger.warn({
				JwtTools: {
					message:
						"Could not load key manager. This is probably wrong and will cause errors.",
					unsupported: key,
				},
				now: Date.now(),
			});
		}

		return manager ?? new MemoryKV();
	}

	async initialize(context?: JwtToolsContext): Promise<void> {
		if (context) {
			this.context = context;
		}

		if (this.signKey !== undefined) {
			return Promise.resolve();
		}
		const { region, jwtPrivateKey } = this.context;
		// TODO: JWT_PREVIOUS_SECRET_NAME

		// Load key: () =>
		if (jwtPrivateKey) {
			const manager = this.connect(jwtPrivateKey);
			const material = await manager.get(jwtPrivateKey);
			if (material.length > 0) {
				Logger.log({
					JwtTools: {
						region,
						secret: {
							jwtPrivateKeyParameterName: jwtPrivateKey,
							length: material.length,
						},
					},
					now: Date.now(),
				});

				this.signKey = {
					manager,
					material,
				};
			} else {
				throw new Error("AUTH_NOT_INITIALIZED");
			}
		} else {
			this.signKey = {
				manager: new MemoryKV(),
				material: "ev04QPaIMZ4QfGG33ZtqjOzgvYXZ22DH",
			};

			Logger.warn({
				JwtTools: {
					"!!! Using default jwt signing key": this.signKey,
				},
				now: Date.now(),
			});
		}
	}

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

export const jwtTools = new JwtTools();
