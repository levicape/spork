import { Logger } from "../server/logging/Logger.js";
import { BigIntJsonSupport } from "./BigIntJsonSupport.js";

Logger.log({
	ServerContext: {
		message: "Polyfilling BigInt.toJSON",
	},
});
BigIntJsonSupport();

type Users = {
	ALLOW_ANONYMOUS_REGISTRATION: boolean;
};

export class ServerContext {
	static ACCOUNTS_KEYS__REGION = "ACCOUNTS_KEYS__REGION" as const;
	static ACCOUNTS_KEYS__JWT_CURRENT_PRIVATE_PARAMETER_NAME =
		"ACCOUNTS_KEYS__JWT_CURRENT_PRIVATE_PARAMETER_NAME" as const;
	static ACCOUNTS_KEYS__JWT_CURRENT_PUBLIC_PARAMETER_NAME =
		"ACCOUNTS_KEYS__JWT_CURRENT_PUBLIC_PARAMETER_NAME" as const;
	static USERS = {
		QUREAU__USERS__ALLOW_ANONYMOUS_REGISTRATION:
			"QUREAU__USERS__ALLOW_ANONYMOUS_REGISTRATION",
	} as const;

	private constructor(
		readonly region?: string,
		readonly jwtPrivateKeyParameterName?: string,
		readonly jwtPublicKeyParameterName?: string,
		readonly users: Users = { ALLOW_ANONYMOUS_REGISTRATION: false },
	) {
		Logger.log({
			ServerContext: {
				region,
				jwtPrivateKeyParameterName,
				jwtPublicKeyParameterName,
			},
			now: Date.now(),
		});
	}

	private static instance: ServerContext;
	static fromEnvironmentVariables(): ServerContext {
		if (ServerContext.instance === undefined) {
			ServerContext.instance = new ServerContext(
				process.env[ServerContext.ACCOUNTS_KEYS__REGION] ??
					process.env.AWS_REGION,
				process.env[
					ServerContext.ACCOUNTS_KEYS__JWT_CURRENT_PRIVATE_PARAMETER_NAME
				],
				process.env[
					ServerContext.ACCOUNTS_KEYS__JWT_CURRENT_PUBLIC_PARAMETER_NAME
				],
				{
					ALLOW_ANONYMOUS_REGISTRATION:
						process.env[
							ServerContext.USERS.QUREAU__USERS__ALLOW_ANONYMOUS_REGISTRATION
						] === "true",
				},
			);
		}
		return ServerContext.instance;
	}
}
