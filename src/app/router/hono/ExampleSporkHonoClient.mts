import { hc } from "hono/client";
import type { ExampleSporkHonoApp } from "./ExampleSporkHonoHttp.mjs";

const client = hc<ExampleSporkHonoApp>("");
// const { Magmap } = client["~"].v1.Spork;
