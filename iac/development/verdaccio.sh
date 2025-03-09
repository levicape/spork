#!/usr/bin/env sh

lc_install_verdaccio() {
	  echo "Installing Verdaccio..."
	helm repo add verdaccio https://verdaccio.github.io/charts
	helm repo update
	helm install verdaccio verdaccio/verdaccio --namespace $1 --create-namespace --set persistence.enabled=true --set persistence.size=20Gi --set persistence.storageClass=standard
}

export VERDACCIO_POD=$(kubectl get pods --namespace default -l "app.kubernetes.io/name=verdaccio,app.kubernetes.io/instance=verdaccio" -o jsonpath="{.items[0].metadata.name}")
echo "Verdaccio: $VERDACCIO_POD";

export VERDACCIO_PORT=$(kubectl get pod --namespace default $VERDACCIO_POD -o jsonpath="{.spec.containers[0].ports[0].containerPort}")
echo "Visit http://127.0.0.1:9200 to use your application"

kubectl --namespace default port-forward $VERDACCIO_POD 9200:$VERDACCIO_PORT;

