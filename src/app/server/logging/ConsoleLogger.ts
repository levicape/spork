const REQUEST_LOG_ENABLED = true;
const CLIENT_LOG_ENABLED = true;

/*
  Debug
    LEMONGRASS_OBSERVED_PRINCIPAL_ID
    LEMONGRASS_OBSERVED_RESOURCE_ID
    NODE_ENV !== "production"
  Request
    LEMONGRASS_OBSERVED_PRINCIPAL_ID
    LEMONGRASS_OBSERVED_RESOURCE_ID
    LEMONGRASS_LOG_REQUEST
    NODE_ENV !== "production"    
  Client
    LEMONGRASS_OBSERVED_PRINCIPAL_ID
    LEMONGRASS_OBSERVED_RESOURCE_ID
    LEMONGRASS_LOG_CLIENT
    NODE_ENV !== "production"  
  Info
  Warn
*/

export const ConsoleLogger = Object.assign(console, {
	request: (_args: Record<string, string>) => {
		REQUEST_LOG_ENABLED && console.dir(_args, { depth: null });
	},
	client: (_args: Record<string, string>) => {
		CLIENT_LOG_ENABLED && console.dir(_args, { depth: null });
	},
	log: (_args: Record<string, string>) => {
		CLIENT_LOG_ENABLED && console.dir(_args, { depth: null });
	},
	debug: (_args: Record<string, string>) => {
		CLIENT_LOG_ENABLED && console.dir(_args, { depth: null });
	},
	warn: (_args: Record<string, string>) => {
		CLIENT_LOG_ENABLED && console.dir(_args, { depth: null });
	},
});

export const isRequestLoggingEnabled = () => REQUEST_LOG_ENABLED;

export const isClientLoggingEnabled = () => CLIENT_LOG_ENABLED;
