#!/usr/bin/env bash

set -euo pipefail

SQL_NAMESPACE="sql-demo"
APP_DB_NAME="demoapp"
POD_NAME=""

usage() {
	cat <<'EOF'
Seed the demo MSSQL database inside a running pod.

Usage:
  ./scripts/seed-db.sh --pod <pod-name> [--namespace <namespace>] [--database <database>]

Options:
  --pod         MSSQL pod name to seed
  --namespace   Kubernetes namespace containing the pod (default: sql-demo)
  --database    Demo database name to create/seed (default: demoapp)
EOF
}

die() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--pod)
		[[ $# -ge 2 ]] || die "Missing value for --pod"
		POD_NAME="$2"
		shift
		;;
	--namespace)
		[[ $# -ge 2 ]] || die "Missing value for --namespace"
		SQL_NAMESPACE="$2"
		shift
		;;
	--database)
		[[ $# -ge 2 ]] || die "Missing value for --database"
		APP_DB_NAME="$2"
		shift
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

require_cmd kubectl

[[ -n "$POD_NAME" ]] || die "--pod is required"

kubectl exec -i -n "$SQL_NAMESPACE" "$POD_NAME" -- /bin/sh -ec '
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
