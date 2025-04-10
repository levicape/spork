import { hc } from "hono/client";
import type { HonoHttpSpork } from "./HonoHttpSpork.mjs";

const client = hc<HonoHttpSpork>("");
export type Client = typeof client;
// client["~"].v1.Spork;
// const { Magmap } = client["~"].v1.Spork;
