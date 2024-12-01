import { Hono } from "hono";
import { serviceValidationZodRoute } from "./open/ServiceValidationZodRoute.js";

const ServiceHonoRouter = () => {
	const app = new Hono();
	const routes = (app: Hono) => {
		return serviceValidationZodRoute(app);
	};
	return routes(app);
};

export { ServiceHonoRouter };
export const serviceHonoRouter = ServiceHonoRouter();
