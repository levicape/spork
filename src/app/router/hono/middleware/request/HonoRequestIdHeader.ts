import { requestId } from "hono/request-id";
import { ulid } from "ulidx";
import {
	StandsTelemetryHttpHeaderBasic,
	standsTelemetryHttpHeaderBasicToJSON,
} from "../../../../../_protocols/stands/tsnode/domain/telemetry/http/requests/telemetry._._.http.request._.js";

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
			return ulid();
		},
		headerName: requestIdHeader,
	});
