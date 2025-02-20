import { Hono } from "hono/quick";
import { pipe } from "../../router/hono/HonoHttpApp.mjs";
import { ServiceValidationZodRoute } from "./controller/open/ServiceValidationZodRoute.js";

const ServiceHonoRouter = () => {
	return pipe(ServiceValidationZodRoute)(new Hono());
};

export { ServiceHonoRouter };
