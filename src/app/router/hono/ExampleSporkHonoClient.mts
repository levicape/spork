import { hc } from "hono/client";
import type { ExampleSporkHonoApp } from "./ExampleSporkHonoHttp.mjs";

const client = hc<ExampleSporkHonoApp>("");
client;
// const { Magmap } = client["~"].v1.Spork;
