#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE coding_platform;
    CREATE DATABASE aural;
    CREATE DATABASE judge0;
EOSQL
