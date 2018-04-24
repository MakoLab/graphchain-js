'use strict';
//	MIT (internal Node.js	-> https://raw.githubusercontent.com/nodejs/node/master/LICENSE)
var fs = require("fs");
//	MIT (internal Node.js	-> https://raw.githubusercontent.com/nodejs/node/master/LICENSE)
var path = require("path");
//	MIT (https://www.npmjs.com/package/sync)
var Sync = require("sync");
//	MIT (https://www.npmjs.com/package/crypto-js)
var CryptoJS = require("crypto-js");
//	MIT (https://www.npmjs.com/package/express)
var express = require("express");
//	MIT (https://www.npmjs.com/package/cors)
var cors = require("cors");
//	MIT (https://www.npmjs.com/package/body-parser)
var bodyParser = require("body-parser");
//	MIT (https://www.npmjs.com/package/ws)
var WebSocket = require("ws");
//	MIT (https://www.npmjs.com/package/isomorphic-fetch)
var fetch = require("isomorphic-fetch");
//	MIT (https://www.npmjs.com/package/sparql-http-client)
var SparqlHttp = require("sparql-http-client")
SparqlHttp.fetch = fetch
//	BSD-3-Clause (https://www.npmjs.com/package/jsonld)
var jsonld = require("jsonld");

//	based on naivechain (https://github.com/lhartikk/naivechain)	-> Apache-2.0 (https://github.com/lhartikk/naivechain/blob/master/License.txt)

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];
var dataendpointUrl = process.env.DATAENDPOINTURL || 'http://localhost:8080/rdf4j-server/repositories/bc';
var endpointUrl = process.env.ENDPOINTURL || 'http://localhost:8080/rdf4j-server/repositories/bc';
var algorithm = process.env.ALGORITHM || 'URGNA2012';
var bc = process.env.BC || 'http://www.ontologies.makolab.com/bc/';
var GraphChain = bc + (process.argv[2] || 'GraphChain');

var logs = 'log_' + path.basename(GraphChain) + '_' + path.basename(endpointUrl) + '.csv';

var dataendpoint = new SparqlHttp({endpointUrl: dataendpointUrl, updateUrl: dataendpointUrl+'/statements'});
var endpoint = new SparqlHttp({endpointUrl: endpointUrl, updateUrl: endpointUrl+'/statements'});

function  calculateHash(index, previousBlock, previousHash, timestamp, dataGraphIri, dataHash) {
 return CryptoJS.SHA256(index.toString() + previousBlock.toString() + previousHash.toString() + timestamp.toString() + dataGraphIri.toString() + dataHash.toString()).toString();
};

class Block {
    constructor(index, previousBlock, previousHash, timestamp, dataGraphIri, dataHash) {
        this.index = index;
        this.previousBlock = previousBlock.toString();
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.dataGraphIri = dataGraphIri.toString();
        this.dataHash = dataHash.toString();
        this.hash = calculateHash(index, previousBlock, previousHash, timestamp, dataGraphIri, dataHash);
    }
}

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

function getGenesisBlock() {
    return new Block(0, GraphChain + "/0", "0", 1502269780, GraphChain, "6826923010db1e28ed439a88ec3ef22c1f3a878762ea520118f49959969de822");
};

function jsonld2Block(b) {
    return new Block(
	parseInt(b[bc + 'hasIndex'][0]['@value']),
	b[bc + 'hasPreviousBlock'][0]['@id'].toString(),
	b[bc + 'hasPreviousHash'][0]['@value'].toString(),
	parseInt(b[bc + 'hasTimeStamp'][0]['@value']),
	b[bc + 'hasDataGraphIRI'][0]['@value'].toString(),
	b[bc + 'hasDataHash'][0]['@value'].toString(),
	b[bc + 'hasHash'][0]['@value'].toString()
    );
};


//	(req, res) => Sync(function(){ res.send(asyncGetBlock.sync(null, index)) })
function asyncGetBlock(index, callback) {
 var query = 'PREFIX bc: <' + bc + '> \
CONSTRUCT { ?IRI ?p ?o } WHERE { GRAPH <' + GraphChain + '> \
{ \
  ?IRI ?p ?o . ?IRI a bc:Block ; ' + ( index === null ? 'FILTER NOT EXISTS { ?prevBlockIRI bc:hasPreviousBlock ?IRI . FILTER ( ?prevBlockIRI != ?IRI ) }' : ( index == 0 ? 'a bc:GenesisBlock' : 'bc:hasIndex "' + index + '"^^xsd:decimal')) + ' \
} \
}';
 // console.log('query=' + query);
 endpoint.selectQuery(query,{accept: 'application/ld+json'}).then(function (res) {
  return res.text()
 }).then(function (body) {
  var result = JSON.parse(body)
  if (result instanceof Array) {
   function isId(element) {
    return ( index === null ? true : ( (Number.isInteger(index) && (typeof(element[bc + 'hasIndex']) !== 'undefined')) ? parseInt(element[bc + 'hasIndex'][0]['@value']) == index : element['@id'] == index));
   }
   result = result.find(isId);
  }
  // console.log('asyncGetBlock[' + index + ']');
  callback(null,jsonld2Block(result))
 }).catch(function (err) {
  console.error('asyncGetBlock: ' + err)
  callback(null,null)
 })
};

//	(req, res) => Sync(function(){ res.send(asyncBlockDELETE.sync(null)) })
function asyncBlockDELETE(callback) {
 endpoint.fetch(endpoint.updateUrl, {'method': 'DELETE'}).then(function (res) {
  if (res.status == 204) {
   callback(null,"OK")
  } else {
   return res.text()
  }
 }).then(function (body) {
  callback(null,body)
 }).catch(function (err) {
  callback(null,err)
 })
};

//	(req, res) => Sync(function(){ res.send(asyncBlockINSERT.sync(null, index)) })
function asyncBlockINSERT(b, callback) {
 var update = 'PREFIX : <' + GraphChain + '/>' + 'PREFIX bc: <' + bc + '> \
INSERT DATA { GRAPH <' + GraphChain + '> { \
:' + b.index + ' a owl:NamedIndividual, bc:Block' + (b.index == 0 ? ', bc:GenesisBlock' : '') + ' ; \
        bc:hasDataGraphIRI "' + b.dataGraphIri + '"^^xsd:anyURI ; \
        bc:hasDataHash "' + b.dataHash + '"^^xsd:string ; \
        bc:hasHash "' + b.hash + '"^^xsd:string ; \
        bc:hasIndex "' + b.index + '"^^xsd:decimal ; \
        bc:hasPreviousBlock <' + b.previousBlock + '> ; \
        bc:hasPreviousHash "' + b.previousHash + '"^^xsd:string ; \
        bc:hasTimeStamp "' + b.timestamp + '"^^xsd:decimal . \
} } \
';
 endpoint.updateQuery(update).then(function (res) {
  if (res.status == 204) {
   callback(null,"OK")
  } else {
   return res.text()
  }
 }).then(function (body) {
  callback(null,body)
 }).catch(function (err) {
  callback(null,err)
 })
};

//	(req, res) => Sync(function(){ res.send(asyncDataGraphGET.sync(null, {graphIri: <graphIri>})) })
//		https://www.w3.org/TR/sparql11-http-rdf-update/#http-get
function asyncDataGraphGET(d, callback) {
 dataendpoint.selectQuery('CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <'+d.graphIri+'> { ?s ?p ?o } }',{accept: 'text/turtle'}).then(function (res) {
  return res.text()
 }).then(function (body) {
  // console.log(body);
  callback(null,body)
 }).catch(function (err) {
  console.error('asyncDataGraphGET: ' + err)
  callback(null,null)
 })
};

//	(req, res) => Sync(function(){ res.send(asyncDataGraphGETNormalized.sync(null, dataGraphIri)) })
//		https://www.w3.org/TR/sparql11-http-rdf-update/#http-get
function asyncDataGraphGETNormalized(dataGraphIri, callback) {
 dataendpoint.selectQuery('CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <'+dataGraphIri+'> { ?s ?p ?o } }',{accept: 'application/ld+json'}).then(function (res) {
  return res.text()
 }).then(function (body) {
  var result = JSON.parse(body)
  jsonld.normalize(result, {
   algorithm: algorithm,
   format: 'application/nquads'
  }, function(err, normalized) {
   // console.log(normalized);
   callback(null,normalized)
  });
 }).catch(function (err) {
  console.error('asyncDataGraphGETNormalized: ' + err)
  callback(null,null)
 })
};

//	(req, res) => Sync(function(){ res.send(asyncDataGraphPUT.sync(null, d)) })
//		https://www.w3.org/TR/sparql11-http-rdf-update/#http-put
function asyncDataGraphPUT(d, callback) {
 dataendpoint.fetch(dataendpointUrl + '/statements?context=' + encodeURIComponent('<' + d.graphIri + '>'), {
	method:	'put',
	headers: {
		'Content-Type': 'text/turtle'
	},
	body:	d.graph
 }).then(function (res) {
  if (res.status == 204) {
   callback(null,"OK")
  } else {
   return res.text()
  }
 }).then(function (body) {
  callback(null,body)
 }).catch(function (err) {
  console.error('asyncDataGraphPUT: ' + err)
  callback(null,err)
 })
};

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.raw({type: 'text/turtle', limit: '100mb'}));
    app.use(cors());

    // API
    app.get('/block', (req, res) => Sync(function(){
	var err = {};
        var newBlock = asyncGetBlock.sync(null, null);
        var tempBlocks = [newBlock];
        var i = null; var previousBlock = undefined; var valid = false;
	while (valid = isValidNewBlock(newBlock, previousBlock = asyncGetBlock.sync(null, newBlock.index - 1), err)) {
         newBlock = previousBlock;
         tempBlocks.push(newBlock);
         if (newBlock.index == 0) break;
        }
        if (valid && (!(valid = (JSON.stringify(asyncGetBlock.sync(null, 0)) === JSON.stringify(getGenesisBlock()))))) {
         err = 'wrong GenesisBlock';
        }
        res.send(JSON.stringify(tempBlocks));
    }));
    app.get('/block/:blockIndex', (req, res) => Sync(function(){
	res.send(asyncGetBlock.sync(null, (isNaN(parseInt(req.params.blockIndex)) ? null : parseInt(req.params.blockIndex))));
    }));
    app.post('/block/create', (req, res) => Sync(function(){
      var err = asyncDataGraphPUT.sync(null, {graphIri: req.query.graphIri.toString(), graph: req.body});
      var dataHash = CryptoJS.SHA256(asyncDataGraphGETNormalized.sync(null, req.query.graphIri.toString())).toString();
      var newBlock = generateNextBlock(req.query.graphIri.toString(), dataHash);
      if (addBlock(newBlock, err)) {
        broadcast(responseLatestMsg());
        console.log('block added: ' + JSON.stringify(newBlock));
      };
      res.send(err);
    }));
    // extra calls
    app.get('/block/create', (req, res) => Sync(function(){
      var err = {};
      var dataHash = CryptoJS.SHA256(asyncDataGraphGETNormalized.sync(null, req.query.graphIri.toString())).toString();
      var newBlock = generateNextBlock(req.query.graphIri.toString(), dataHash);
      if (addBlock(newBlock, err)) {
        broadcast(responseLatestMsg());
        console.log('block added: ' + JSON.stringify(newBlock));
      };
      res.json({status: 'OK'});
    }));
    app.get('/getLatestBlock', (req, res) => Sync(function(){ res.send(asyncGetBlock.sync(null, null)) }));
    app.get('/responseLatestMsg', (req, res) => Sync(function(){ res.send(responseLatestMsg()) }));
    app.get('/responseChainMsg', (req, res) => Sync(function(){ res.send(responseChainMsg()) }));
    app.get('/benchmark/block', (req, res) => Sync(function(){
	var start = parseInt(new Date().getTime());
	var err = {};
	var newBlock = asyncGetBlock.sync(null, null);
	var blocks = newBlock.index;
	var i = null; var previousBlock = undefined; var valid = false;
	while (valid = isValidNewBlock(newBlock, previousBlock = asyncGetBlock.sync(null, newBlock.index - 1), err)) {
	 newBlock = previousBlock;
	 if (newBlock.index == 0) break;
	}
	if (valid && (!(valid = (JSON.stringify(asyncGetBlock.sync(null, 0)) === JSON.stringify(getGenesisBlock()))))) {
	 err[newBlock.index] = 'wrong GenesisBlock';
	}
	var time = parseInt(new Date().getTime()) - start;
	console.log(GraphChain + '\t' + blocks + '\t' + time + '\t' + JSON.stringify(err));
	fs.appendFileSync(logs, blocks + '\t' + time + '\t' + JSON.stringify(err) + '\n');
	res.send(JSON.stringify({"valid": valid, "err": err, "blocks": blocks, "time": time}));
    }));
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => Sync(function(){
	if (asyncGetBlock.sync(null, 0) === null) {
		console.log('asyncBlockINSERT(0): ' + asyncBlockINSERT.sync(null, getGenesisBlock()).toString());
	}
	if (asyncGetBlock.sync(null, 0) !== null) {
		console.log('getGenesisBlock(' + asyncGetBlock.sync(null, 0).index + ')');
		console.log('getLatestBlock (' + asyncGetBlock.sync(null, null).index + ')');
		console.log('Listening http on port: ' + http_port);
		connectToPeers(initialPeers);
		initP2PServer();
	} else {
		console.log('ERR: cannot connect to triplestore');
		process.exit(1);
	}
    }));
};


var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);

};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => Sync(function(){
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    }));
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};


var generateNextBlock = (graphIri, dataHash) => {
    var previousBlock = asyncGetBlock.sync(null, null);
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = parseInt(new Date().getTime() / 1000);
    return new Block(nextIndex, (GraphChain + '/' + previousBlock.index).toString(), previousBlock.hash, nextTimestamp, graphIri, dataHash);
};

var calculateHashForBlock = (block) => {
    return calculateHash(block.index, block.previousBlock, block.previousHash, block.timestamp, block.dataGraphIri, block.dataHash);
};

var addBlock = (newBlock, err) => {
    if (isValidNewBlock(newBlock, asyncGetBlock.sync(null, null), err)) {
	console.log('asyncBlockINSERT: ' + asyncBlockINSERT.sync(null, newBlock).toString());
	return true;
    } else {
	console.log('ERR(isValidNewBlock): ' + err[newBlock.index]);
	return false;
    }
};

var isValidNewBlock = (newBlock, previousBlock, err) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        err[newBlock.index] = 'invalid index';
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        err[newBlock.index] = 'invalid previoushash';
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        err[newBlock.index] = 'invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash;
        return false;
     } else if (newBlock.dataHash !== CryptoJS.SHA256(asyncDataGraphGETNormalized.sync(null, newBlock.dataGraphIri)).toString()) {
       err[newBlock.index] = 'invalid dataHash:' + newBlock.dataHash + ' !== calculatedDataHash:' + CryptoJS.SHA256(asyncDataGraphGETNormalized.sync(null, newBlock.dataGraphIri));
       return false;
    }
    return true;
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('ERR: connection to peer failed')
            process.exit(1);
        });
    });
};

var handleBlockchainResponse = (message) => {
    var receivedBlocks = message.data.sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = asyncGetBlock.sync(null, null);
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            const buf = Buffer.from(message.graph[latestBlockReceived.dataGraphIri], 'base64');
	    console.log("asyncDataGraphPUT(" + latestBlockReceived.dataGraphIri + "): " + asyncDataGraphPUT.sync(null, {graphIri: latestBlockReceived.dataGraphIri, graph: buf.toString('utf8')}));
	    var err = {};
	    if (addBlock(latestBlockReceived, err)) {
		console.log('block added: ' + JSON.stringify(latestBlockReceived));
		broadcast(responseLatestMsg());
	    }
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks, message.graph);
        }
    } else {
        console.log('received blockchain is not longer than received blockchain. Do nothing');
    }
};

var replaceChain = (newBlocks, graph) => {
    var latestBlockHeld = asyncGetBlock.sync(null, null);
    console.log('asyncBlockDELETE: ' + asyncBlockDELETE.sync(null));
    if (isValidChain(newBlocks, graph) && newBlocks.length > latestBlockHeld.index) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
	   console.log('asyncBlockINSERT(0): ' + asyncBlockINSERT.sync(null, newBlocks[0]).toString());
	   var err = {};
	   var i = 1;
    	   while(addBlock(newBlocks[i], err) && (i < newBlocks.length)) {
		// todo:	different dataendpoint
        	console.log('block added(' + JSON.stringify(err) + '): ' + JSON.stringify(newBlocks[i]));
		i++;
	   };
	if (err === {}) {
        broadcast(responseLatestMsg());
	} else {
	   console.log('block add error: ' + JSON.stringify(err))
	}
    } else {
        console.log('Received blockchain invalid');
    }
};

var isValidChain = (blockchainToValidate, graph) => {
    var err = {};
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
	console.log('isValidChain i=' + i);
	var buf = null;
        if (((buf = Buffer.from(graph[blockchainToValidate[i].dataGraphIri], 'base64')) !== null) && (asyncDataGraphPUT.sync(null, {graphIri: blockchainToValidate[i].dataGraphIri, graph: buf.toString('utf8')}) === 'OK') && isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1], err)) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>{
//    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
	var err = {};
	var newBlock = asyncGetBlock.sync(null, null);
	var tempBlocks = [newBlock];
	var graph = {};
	var i = null; var previousBlock = undefined; var valid = false;
	while (valid = isValidNewBlock(newBlock, previousBlock = asyncGetBlock.sync(null, newBlock.index - 1), err)) {
		const buf = Buffer.from(asyncDataGraphGET.sync(null, {graphIri: newBlock.dataGraphIri}), 'utf8');
		graph[newBlock.dataGraphIri] = buf.toString('base64');
		newBlock = previousBlock;
		tempBlocks.push(newBlock);
		if (newBlock.index == 0) break;
	}
	if (valid && (!(valid = (JSON.stringify(asyncGetBlock.sync(null, 0)) === JSON.stringify(getGenesisBlock()))))) {
		err = 'wrong GenesisBlock';
	}
	return({'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': tempBlocks, 'graph': graph});
};
var responseLatestMsg = () => {
    var ret = {};
    ret['type'] = MessageType.RESPONSE_BLOCKCHAIN;
    ret['data'] = [asyncGetBlock.sync(null, null)];
    const buf = Buffer.from(asyncDataGraphGET.sync(null, {graphIri: [ret['data'][0].dataGraphIri]}), 'utf8');
    ret['graph'] = {[ret['data'][0].dataGraphIri]: buf.toString('base64')};
    return ret;
};

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

initHttpServer();
