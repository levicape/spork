#!/usr/bin/env -S node --import tsx --no-warnings

const routemap = {
	hono: "world",
};

process.stdout.write(JSON.stringify(routemap, null, 2));
