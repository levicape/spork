import { type LambdaContext, type LambdaEvent, handle } from "hono/aws-lambda";
import { HonoHttpServer } from "../app/router/index.js";

type LambdaBindings = {
	event: LambdaEvent;
	lambdaContext: LambdaContext;
};
const { app } = await HonoHttpServer();
export const handler = handle(app);
