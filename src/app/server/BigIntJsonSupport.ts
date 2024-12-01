export const BigIntJsonSupport = () => {
	// biome-ignore lint/suspicious/noExplicitAny:
	(BigInt as any).prototype.toJSON = function () {
		return Number.parseInt(this.toString());
	};
};
