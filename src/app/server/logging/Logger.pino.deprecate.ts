// import { createPinoLogger, serializeRequest } from "@bogeychan/elysia-logger";
// import pino from "pino";
// import {
// 	StructuredLogFormatter,
// 	lambdaRequestTracker,
// 	pinoLambdaDestination,
// } from "pino-lambda";
// import { ulid } from "ulidx";

// const destination = pinoLambdaDestination({
// 	formatter: new StructuredLogFormatter(),
// });
// const logger = pino(
// 	{
// 		serializers: {
// 			request: (request: Request) => {
// 				const url = new URL(request.url);
// 				return {
// 					...serializeRequest(request),
// 					requestId:
// 						request.headers.get(
// 							// standsTelemetryHttpHeaderBasicToJSON(
// 							// 	StandsTelemetryHttpHeaderBasic.X_Request_ID,
// 							// ),
// 							"X_Request_ID",
// 						) ?? ulid(),
// 					path: url.pathname,
// 				};
// 			},
// 		},
// 	},
// 	destination,
// );
// export const PinoLogger = logger;
// export const LambdaPinoElysiaLogger = createPinoLogger(logger);
// export const LambdaRequestTracker = lambdaRequestTracker();
