import c from "consola";
import { ulid } from "ulidx";

export const ConsolaLogger = () => {
	c.withTag(
		ulid(Date.now() + Math.floor(Math.random() * 50000)).slice(21),
	).wrapConsole();
};
