import { Effect } from "effect";
import { handle } from "hono/aws-lambda";
import { app } from "../app/router/hono/HonoHttpSpork.mjs";

export const handler = handle(await Effect.runPromise(app));
