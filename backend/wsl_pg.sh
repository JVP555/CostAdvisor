pg_isready -h 127.0.0.1 -p 5432 || sudo service postgresql start
sleep 2
pg_isready -h 127.0.0.1 -p 5432
