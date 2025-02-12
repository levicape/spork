import { Config } from "effect";
import { env } from "std-env";

export class ServerJwtConfig {
	static ACCOUNTS_KEYS__REGION = "ACCOUNTS_KEYS__REGION" as const;
	static ACCOUNTS_KEYS__JWT_CURRENT_PRIVATE_PARAMETER_NAME =
		"ACCOUNTS_KEYS__JWT_CURRENT_PRIVATE_PARAMETER_NAME" as const;
	static ACCOUNTS_KEYS__JWT_CURRENT_PUBLIC_PARAMETER_NAME =
		"ACCOUNTS_KEYS__JWT_CURRENT_PUBLIC_PARAMETER_NAME" as const;

	constructor(
		readonly region: string | null,
		readonly jwtPrivateKeyParameterName: string | null,
		readonly jwtPublicKeyParameterName: string | null,
	) {}
}

export const SporkServerJwtConfig = Config.map(
	Config.all([
		Config.nested(
			Config.all([
				Config.string("REGION").pipe(
					Config.withDefault(env.AWS_REGION ?? null),
				),
				Config.string("JWT_CURRENT_PRIVATE_KEY").pipe(Config.withDefault(null)),
				Config.string("JWT_CURRENT_PUBLIC_KEY").pipe(Config.withDefault(null)),
			]),
			"ACCOUNTS_KEYS_",
		),
	]),
	([[region, jwtPrivateKeyParameterName, jwtPublicKeyParameterName]]) =>
		new ServerJwtConfig(
			region,
			jwtPrivateKeyParameterName,
			jwtPublicKeyParameterName,
		),
);
