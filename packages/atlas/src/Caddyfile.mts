// #!/usr/bin/env -S node --env-file .env --import tsx --no-warnings

// {
// 	"/": {
// 	  "$kind": "ComposeRouteResource",
// 	  url: "ui:${ROOT_NS}${HTTP_NS}${MAGMAP_NS}${MAGMAP_UI}",
// 	  protocol: "http",
// 	},
// 	"/~/v1/Spork/Magmap": {
// 	  "$kind": "ComposeRouteResource",
// 	  url: "magmap-http:${ROOT_NS}${HTTP_NS}${MAGMAP_NS}${MAGMAP_HTTP}",
// 	  protocol: "http",
// 	},
// 	"/~/v1/Spork": {
// 	  "$kind": "LambdaRouteResource",
// 	  url: "spork-server:${ROOT_NS}${HTTP_NS}${SPORK_NS}${SPORK_HTTP}",
// 	  protocol: "http",
// 	  lambda: {
// 		arn: "arn:aws:lambda:us-west-2:557690612436:function:paloma-nevada-http-current-function-8e60424",
// 		name: "paloma-nevada-http-current-function-8e60424",
// 		qualifier: "current",
// 	  },
// 	  cloudmap: {
// 		namespace: {
// 		  name: "paloma-datalayer-current-pdns-57a2-0d48",
// 		},
// 		service: {
// 		  name: "paloma-nevada-http-current-service-on-8e60424"
// 		},
// 		instance: {
// 		  id: "paloma-nevada-http-current-instance",
// 		  attributes: {
// 			AWS_INSTANCE_CNAME: "https://xmlcdrzlqmgl2dghhih5pqotwy0kvwyl.lambda-url.us-west-2.on.aws/",
// 			CI_ENVIRONMENT: "current",
// 			CONTEXT_PREFIX: "paloma-nevada-http-current",
// 			PACKAGE_NAME: "@levicape/paloma-nevada-io",
// 			STACKREF_ROOT: "paloma",
// 			STACK_NAME: "paloma-nevada-http.current"
// 		  }
// 		}
// 	  }
// 	}
//   }

//
/*
in caddyfile format
Caddyfile
{
	apps {
		http {
			servers {
				magmap-ui {
					listen :32130
					routes {
						uri / {
							reverse_proxy magmap-ui:32130
						}
					}
				}
				magmap-http {
					listen :32131
					routes {
						uri /~v1/Spork/Magmap {
							reverse_proxy magmap-http:32131
						}
					}
				}
			}
		}
	}
}
*/
