import { Hono } from "hono";
import { wellknownHealthcheckRoute } from "./controller/index.js";

const WellknownHonoRouter = () => {
	const app = new Hono();
	const routes = (router: typeof app) => {
		return wellknownHealthcheckRoute(router);
	};

	return routes(app);
};

export { WellknownHonoRouter };
export const wellknownHonoRouter = WellknownHonoRouter();
