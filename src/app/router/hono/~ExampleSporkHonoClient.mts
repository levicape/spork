import { hc } from "hono/client";
import type { ExampleSporkHonoApp } from "./~ExampleSporkHonoHttp.mjs";

const client = hc<ExampleSporkHonoApp>("");
export type Client = typeof client;
// const { Magmap } = client["~"].v1.Spork;
