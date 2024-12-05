import {
	GetSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { IKeyValueStore } from "../IKeyValueStore.js";

export class SecretsManager implements IKeyValueStore<string> {
	client: SecretsManagerClient;
	constructor(readonly region: string) {
		this.client = new SecretsManagerClient({
			region,
		});
	}

	async get(name: string): Promise<string> {
		const result = await this.client.send(
			new GetSecretValueCommand({
				SecretId: name,
			}),
		);

		if (!result.SecretString) {
			throw new Error("Secret not found");
		}

		return result.SecretString;
	}
}
