#!/bin/bash
export NODE_PATH=/usr/lib/nodejs:/usr/lib/node_modules:/usr/share/javascript
export HTTP_PORT=3001
export P2P_PORT=6001
export ENDPOINTURL=http://binsem-dev:8080/rdf4j-server/repositories/bc
export DATAENDPOINTURL=http://binsem-dev:8080/rdf4j-server/repositories/bc

/usr/bin/node main.js GraphChainJava
