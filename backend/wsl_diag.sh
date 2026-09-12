export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
echo "whoami: $(whoami)"; echo "tmp:"; ls -ld /tmp
touch /tmp/_probe && echo "tmp writable" || echo "tmp NOT writable"
mkdir -p ~/catmp && touch ~/catmp/_probe && echo "home writable" || echo "home NOT writable"
