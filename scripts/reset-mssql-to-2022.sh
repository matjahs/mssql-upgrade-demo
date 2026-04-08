#!/usr/bin/env bash

set -euo pipefail

EXPECTED_IMAGE="mcr.microsoft.com/mssql/server:2022-latest"
UPGRADE_IMAGE="mcr.microsoft.com/mssql/server:2025-latest"
WORKLOAD_FILE="workloads/mssql/sql-deployment.yaml"
NAMESPACE_FILE="workloads/mssql/sql-namespace.yaml"
SQL_NAMESPACE="sql-demo"
DEPLOYMENT_NAME="mssql"
PVC_NAME="mssql-data"
APP_DB_NAME="demoapp"
ARGO_NAMESPACE="argocd"
ROOT_ARGO_APP="root-apps"
ARGO_APP="mssql-demo"

root_auto_sync_was_enabled=0
auto_sync_was_enabled=0
reset_succeeded=0
assume_yes=0

usage() {
	cat <<'EOF'
Reset the MSSQL demo back to a fresh SQL Server 2022 state.

This script:
1. Reverts the latest commit that upgraded MSSQL to 2025
2. Pushes the revert commit to the current branch's origin
3. Temporarily disables ArgoCD auto-sync for the app-of-apps and MSSQL app
4. Deletes the MSSQL deployment and PVC
5. Reapplies the 2022 manifests and waits for SQL Server to come back
6. Recreates the demo database and seed data if the PVC reset removed them
7. Re-enables ArgoCD auto-sync on success

The PVC reset destroys the current SQL data.

Usage:
  ./scripts/reset-mssql-to-2022.sh [--yes]

Options:
  --yes    Skip the confirmation prompt
EOF
}

die() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

current_image() {
	awk '/image:/ { print $2; exit }' "$WORKLOAD_FILE"
}

image_in_revision() {
	git show "$1:$WORKLOAD_FILE" | awk '/image:/ { print $2; exit }'
}

head_upgrade_commit() {
	local head_commit
	local parent_commit
	local before_image
	local after_image

	head_commit="$(git rev-parse HEAD)"
	parent_commit="$(git rev-parse HEAD^ 2>/dev/null)" || die "HEAD has no parent commit to inspect"
	before_image="$(image_in_revision "$parent_commit")"
	after_image="$(image_in_revision "$head_commit")"

	[[ "$after_image" == "$UPGRADE_IMAGE" ]] || die "HEAD does not set $WORKLOAD_FILE to $UPGRADE_IMAGE"
	[[ "$before_image" == "$EXPECTED_IMAGE" ]] || die "HEAD is not the MSSQL upgrade commit; expected previous image $EXPECTED_IMAGE but found $before_image"

	printf '%s\n' "$head_commit"
}

sql_pod_name() {
	kubectl get pod -n "$SQL_NAMESPACE" -l app=mssql -o jsonpath='{.items[0].metadata.name}'
}

wait_for_sql_pod() {
	local pod_name=""
	local retries=60
	local attempt

	for ((attempt = 1; attempt <= retries; attempt += 1)); do
		pod_name="$(sql_pod_name)"
		if [[ -n "$pod_name" ]]; then
			printf '%s\n' "$pod_name"
			return 0
		fi

		sleep 2
	done

	return 1
}

wait_for_sql_master() {
	local pod_name="$1"
	local retries=60
	local attempt

	for ((attempt = 1; attempt <= retries; attempt += 1)); do
		if kubectl exec -n "$SQL_NAMESPACE" "$pod_name" -- /bin/sh -ec "
			/opt/mssql-tools18/bin/sqlcmd \
				-S localhost \
				-U sa \
				-P \"\$MSSQL_SA_PASSWORD\" \
				-d master \
				-b \
				-No \
				-Q 'SET NOCOUNT ON; SELECT 1'
		" >/dev/null 2>&1; then
			return 0
		fi

		sleep 5
	done

	return 1
}

bootstrap_demo_db() {
	local pod_name="$1"

	kubectl exec -i -n "$SQL_NAMESPACE" "$pod_name" -- /bin/sh -ec '
		tmp_file="$(mktemp)"
		trap "rm -f \"$tmp_file\"" EXIT
		cat >"$tmp_file"
		/opt/mssql-tools18/bin/sqlcmd \
			-S localhost \
			-U sa \
			-P "$MSSQL_SA_PASSWORD" \
			-d master \
			-b \
			-No \
			-i "$tmp_file"
	' <<SQL
IF DB_ID(N'$APP_DB_NAME') IS NULL
BEGIN
  EXEC(N'CREATE DATABASE [$APP_DB_NAME]');
END;
GO

USE [$APP_DB_NAME];
GO

IF OBJECT_ID(N'dbo.products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.products (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    price DECIMAL(18, 2) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.products)
BEGIN
  INSERT INTO dbo.products (name, price)
  VALUES
    (N'Product 1', 9.99),
    (N'Product 2', 19.99);
END;
GO
SQL
}

wait_for_demo_db() {
	local pod_name="$1"
	local retries=30
	local attempt

	for ((attempt = 1; attempt <= retries; attempt += 1)); do
		if kubectl exec -n "$SQL_NAMESPACE" "$pod_name" -- /bin/sh -ec "
			/opt/mssql-tools18/bin/sqlcmd \
				-S localhost \
				-U sa \
				-P \"\$MSSQL_SA_PASSWORD\" \
				-d \"$APP_DB_NAME\" \
				-b \
				-No \
				-Q 'SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.products'
		" >/dev/null 2>&1; then
			return 0
		fi

		sleep 2
	done

	return 1
}

cleanup() {
	if [[ "$reset_succeeded" -eq 1 ]]; then
		return
	fi

	if [[ "$root_auto_sync_was_enabled" -eq 1 || "$auto_sync_was_enabled" -eq 1 ]]; then
		printf 'Reset failed. ArgoCD auto-sync may still be disabled.\n' >&2
		printf 'Re-enable it with:\n' >&2
		printf 'kubectl patch application %s -n %s --type=merge -p '\''{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'\''\n' "$ROOT_ARGO_APP" "$ARGO_NAMESPACE" >&2
		printf 'kubectl patch application %s -n %s --type=merge -p '\''{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'\''\n' "$ARGO_APP" "$ARGO_NAMESPACE" >&2
	fi
}

trap cleanup EXIT

while [[ $# -gt 0 ]]; do
	case "$1" in
	--yes)
		assume_yes=1
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		usage >&2
		die "Unknown argument: $1"
		;;
	esac
	shift
done

require_cmd git
require_cmd kubectl

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Run this script inside the git repository"
cd "$repo_root"

[[ -f "$WORKLOAD_FILE" ]] || die "Missing workload file: $WORKLOAD_FILE"
[[ -f "$NAMESPACE_FILE" ]] || die "Missing namespace file: $NAMESPACE_FILE"

branch="$(git branch --show-current)"
[[ -n "$branch" ]] || die "Could not determine current git branch"

[[ -z "$(git status --porcelain --untracked-files=all)" ]] || die "Working tree is not clean. Commit, stash, or remove local changes first."

if [[ "$assume_yes" -ne 1 ]]; then
	printf 'This will revert the latest MSSQL 2025 upgrade commit, push %s to origin, and delete PVC %s/%s. Continue? [y/N] ' "$branch" "$SQL_NAMESPACE" "$PVC_NAME"
	read -r reply
	if [[ ! "$reply" =~ ^[Yy]$ ]]; then
		printf 'Cancelled.\n'
		exit 0
	fi
fi

if [[ "$(current_image)" != "$EXPECTED_IMAGE" ]]; then
	upgrade_commit="$(head_upgrade_commit)"

	printf 'Reverting upgrade commit %s\n' "$upgrade_commit"
	git revert --no-edit "$upgrade_commit"
fi

[[ "$(current_image)" == "$EXPECTED_IMAGE" ]] || die "Expected $WORKLOAD_FILE to use $EXPECTED_IMAGE after revert"

if kubectl get application "$ROOT_ARGO_APP" -n "$ARGO_NAMESPACE" -o jsonpath='{.spec.syncPolicy.automated}' >/dev/null 2>&1; then
	root_auto_sync_payload="$(kubectl get application "$ROOT_ARGO_APP" -n "$ARGO_NAMESPACE" -o jsonpath='{.spec.syncPolicy.automated}')"
	if [[ -n "$root_auto_sync_payload" ]]; then
		root_auto_sync_was_enabled=1
		kubectl patch application "$ROOT_ARGO_APP" -n "$ARGO_NAMESPACE" --type=json -p='[{"op":"remove","path":"/spec/syncPolicy/automated"}]' >/dev/null
	fi
fi

if kubectl get application "$ARGO_APP" -n "$ARGO_NAMESPACE" -o jsonpath='{.spec.syncPolicy.automated}' >/dev/null 2>&1; then
	auto_sync_payload="$(kubectl get application "$ARGO_APP" -n "$ARGO_NAMESPACE" -o jsonpath='{.spec.syncPolicy.automated}')"
	if [[ -n "$auto_sync_payload" ]]; then
		auto_sync_was_enabled=1
		kubectl patch application "$ARGO_APP" -n "$ARGO_NAMESPACE" --type=json -p='[{"op":"remove","path":"/spec/syncPolicy/automated"}]' >/dev/null
	fi
fi

printf 'Pushing %s to origin\n' "$branch"
git push origin "$branch"

printf 'Resetting live MSSQL deployment and PVC\n'
kubectl delete deployment "$DEPLOYMENT_NAME" -n "$SQL_NAMESPACE" --ignore-not-found --wait=true
kubectl delete pvc "$PVC_NAME" -n "$SQL_NAMESPACE" --ignore-not-found --wait=true

kubectl apply -f "$NAMESPACE_FILE"
kubectl apply -f "$WORKLOAD_FILE"
kubectl rollout status deployment/"$DEPLOYMENT_NAME" -n "$SQL_NAMESPACE" --timeout=300s

pod_name="$(wait_for_sql_pod)" || die "Could not find the restarted MSSQL pod"

printf 'Waiting for SQL Server master database to accept connections\n'
wait_for_sql_master "$pod_name" || die "SQL Server never became ready on master"

printf 'Recreating demo database and seed data\n'
bootstrap_demo_db "$pod_name" || die "Failed to recreate $APP_DB_NAME"

printf 'Waiting for %s to become queryable\n' "$APP_DB_NAME"
wait_for_demo_db "$pod_name" || die "$APP_DB_NAME never became queryable"

if [[ "$auto_sync_was_enabled" -eq 1 ]]; then
	kubectl patch application "$ARGO_APP" -n "$ARGO_NAMESPACE" --type=merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}' >/dev/null
fi

if [[ "$root_auto_sync_was_enabled" -eq 1 ]]; then
	kubectl patch application "$ROOT_ARGO_APP" -n "$ARGO_NAMESPACE" --type=merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}' >/dev/null
fi

reset_succeeded=1

kubectl get pods -n "$SQL_NAMESPACE"
kubectl get pvc -n "$SQL_NAMESPACE"

printf 'MSSQL demo reset to SQL Server 2022.\n'
