# GraphChain PoC: GraphChain.js

*GraphChain.js* is simple implementation of blockchain technology, based on [Naivechain](https://github.com/lhartikk/naivechain).

For now, you can send a RDF graph by the HTTP endpoint and it will be persisted in a repository together with a block's header.  There is also a way to verify whole chain.

## Quick start

Set up two connected nodes and mine 1 block
- variables `ENDPOINTURL` and `DATAENDPOINTURL` contains URL to SPARQL Endpoint  (e.g. *http://localhost:8080/rdf4j-server/repositories/bc1*) - see `run.sh` and `run_peer.sh`
- file 'PBLD0EJDB5FWOLXP3B76.ttl' contains sample data (`curl -o PBLD0EJDB5FWOLXP3B76.ttl http://lei.info/PBLD0EJDB5FWOLXP3B76.ttl`)

```
npm install
./run.sh &
./run_peer.sh &
curl -v -H "Content-Type: text/turtle" -d @PBLD0EJDB5FWOLXP3B76.ttl 'http://localhost:3001/block/create?graphIri=http://lei.info/PBLD0EJDB5FWOLXP3B76'
```

## HTTP API

#### Get blockchain

```
curl http://localhost:3001/block
```

#### Get 1st block

```
curl http://localhost:3001/block/1
```
