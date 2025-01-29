import { ConsolaTransport } from "@loglayer/transport-consola";
import { createConsola } from "consola";
import { LogLayer } from "loglayer";
import { ulid } from "ulidx";

const log = new LogLayer({
	transport: new ConsolaTransport({
		logger: createConsola({
			level: 5,
		}),
	}),
});
