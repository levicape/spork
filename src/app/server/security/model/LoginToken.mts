const EXPIRATION_IN_MINUTES = 120;
export class LoginToken {
	expires: string;

	constructor(
		readonly id: string,
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
}
