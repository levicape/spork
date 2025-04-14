import { requestId } from "hono/request-id";
import {
	StandsTelemetryHttpHeaderBasic,
	standsTelemetryHttpHeaderBasicToJSON,
} from "../../../../../_protocols/stands/tsnode/domain/telemetry/http/requests/telemetry._._.http.request._.js";
import { $$_traceId_$$ } from "../../../../server/logging/LoggingPlugins.mjs";

export const HonoRequestIdHeaderStandard = () =>
	standsTelemetryHttpHeaderBasicToJSON(
		StandsTelemetryHttpHeaderBasic.X_Request_ID,
	);

export const HonoRequestIdHeader = ({
	requestIdHeader,
}: {
	requestIdHeader: string;
}) =>
	requestId({
		generator() {
			return $$_traceId_$$();
		},
		headerName: requestIdHeader,
	});
