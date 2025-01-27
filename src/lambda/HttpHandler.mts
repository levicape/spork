import { handle } from "hono/aws-lambda";
import { app } from "../app/router/hono/HonoHttpSpork.mjs";

export const handler = handle(app);
