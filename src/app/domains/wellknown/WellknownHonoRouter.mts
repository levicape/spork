import { Hono } from "hono/quick";
import { pipe } from "../../router/hono/HonoHttpAppFactory.mjs";
import { WellknownHealthcheckRoute } from "./controller/healthcheck/WellknownHealthcheckRoute.js";

const WellknownHonoRouter = () => {
	return pipe(WellknownHealthcheckRoute)(new Hono());
};

export type WellknownHonoApp = ReturnType<typeof WellknownHonoRouter>;
export { WellknownHonoRouter };
