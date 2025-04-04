import { SecurityRoles } from "./Security.mjs";

const EXPIRATION_IN_MINUTES = 120;
export class LoginToken {
	expires: string;

	constructor(
		readonly id: string,
		readonly role: SecurityRoles[],
		readonly created: string,
		readonly host: string,
	) {
		this.expires = (
			Number.parseInt(created) +
			EXPIRATION_IN_MINUTES * 60000
		).toString();
	}

	private static issuer: string | undefined = process.env.JWT_ISSUER;

	static getIssuer(): string {
		return LoginToken.issuer || "localhost";
	}

	static player(id: string) {
		return new LoginToken(
			id,
			[SecurityRoles.LOGIN, SecurityRoles.REGISTERED],
			Date.now().toString(),
			LoginToken.getIssuer(),
		);
	}

	static anonymous(id: string) {
		return new LoginToken(
			id,
			[SecurityRoles.LOGIN],
			Date.now().toString(),
			LoginToken.getIssuer(),
		);
	}

	static fromToken(token: LoginToken) {
		return new LoginToken(
			token.id,
			token.role,
			Date.now().toString(),
			LoginToken.getIssuer(),
		);
	}
}
