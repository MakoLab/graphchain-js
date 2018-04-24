#!/bin/bash
export NODE_PATH=/usr/lib/nodejs:/usr/lib/node_modules:/usr/share/javascript
export HTTP_PORT=3002
export P2P_PORT=6002
export ENDPOINTURL=http://binsem-dev:8080/rdf4j-server/repositories/bc10000
export DATAENDPOINTURL=http://binsem-dev:8080/rdf4j-server/repositories/bc
export PEERS=ws://localhost:6001

/usr/bin/node main.js GraphChainJava
