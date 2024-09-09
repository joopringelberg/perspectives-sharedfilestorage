// BEGIN LICENSE
// Perspectives Distributed Runtime
// SPDX-FileCopyrightText: 2019 Joop Ringelberg (joopringelberg@perspect.it), Cor Baars
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// Full text of this license can be found in the LICENSE directory in the projects root.

// END LICENSE

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
import { readFile } from 'node:fs/promises';
import { Storage } from 'megajs'
const init = require ('@paralleldrive/cuid2').init;
var argv = require('yargs/yargs')(process.argv.slice(2)).parse();

const port = argv.port;
const maxfiles = argv.maxfiles || 10
const maxkeys = argv.maxkeys | 100;
const userid = argv.userid;
const password = argv.password;
// The path to the file in which we save `providedKeys`.
const statefile = argv.statefile;

let megaStorage, providedKeys, nrOfKeys = {};
// providedKeys = {key: {nrOfUploadedFiles: INT, nrOfRequestedKeys: INT}}

new Storage(
  { email: userid
  , password
  , userAgent: "Perspectives"
  , keepalive: false}).ready.then( s => megaStorage = s );

const app = express();
app.use(express.json());

// Set up multer to store files in memory (useful for relaying them to another service)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Always returns a object, either:
// {error: INTEGER, message: STRING}
// {megaUrl: STRING}
app.post('/ppfsf/uploadfile', upload.single('file'), async(req, res) => {
  if (!req.file ) {
    res.status(400).send({error: NOFILE, message: 'no file uploaded'});
  }
  else if (!req.body.sharedFileServerKey) {
    res.status(401).send({error: NOKEY, message: "A key is needed for this request."})
  }
  else if ( !providedKeys[req.body.sharedFileServerKey] ) {
    res.status(406).send({error: KEYUNKNOWN, message: 'This key is not given out by this service.'})
  }
  else if ( !uploadAllowed( providedKeys[req.body.sharedFileServerKey] )){
    res.status(403).send({error: MAXFILESREACHED, message: 'The maximum number of files has been reached for this key.'})
  }
  else {
    try {
      // Buffer of the uploaded file (from Multer).
      const fileBuffer = req.file.buffer 
      const uint8Array = new Uint8Array( fileBuffer );
      megaStorage.upload( { name: req.body.name, size: req.body.size }, uint8Array ).complete
        .then( megaUrl => res.status(201).send( {megaUrl} ))
    }
    catch(e) {
      res.status(400).send({error: MEGAERROR, message: e.toString()});
    }
  }})


// Checks whether the maximum number of uploads hasn't yet been reached.
// If allowed increases the number of registered uploads for this key.
function uploadAllowed( {nrOfUploadedFiles, nrOfRequestedKeys} )
{
  if (nrOfUploadedFiles < maxfiles){
    providedKeys[key] = {nrOfUploadedFiles: nrOfUploadedFiles + 1, nrOfRequestedKeys};
    return true;
  }
  else {
    return false;
  }
}

// Always returns a object, either:
// {error: INTEGER, message: STRING}
// {newKey: STRING}
app.post('/ppsfs/getsharedfileserverkey', (req, res) => {
  const key = req.body.key;
  let newKey;
  if (!key) {
    res.status(401).send({error: NOKEY, message: "A key is needed for this request."})
  }
  else if ( !providedKeys[key] ) {
    res.status(406).send({error: KEYUNKNOWN, message: 'This key is not given out by this service.'})
  }
  else if (!newKeyAllowed( providedKeys[key] )) {
    res.status(403).send({error: MAXKEYSREACHED, message: "The maximum number of new keys has been reached."})
  } 
  else {
    newKey = cuid();
    res.status(201).send({newKey});
  }
});

// Checks whether the maximum number of uploads hasn't yet been reached.
// If allowed increases the number of registered uploads for this key.
function newKeyAllowed( {nrOfUploadedFiles, nrOfRequestedKeys} )
{
  if (nrOfRequestedKeys < maxkeys){
    providedKeys[key] = {nrOfUploadedFiles, nrOfRequestedKeys: nrOfRequestedKeys + 1};
    return true;
  }
  else {
    return false;
  }
}

// Error types
const NOKEY = 1;
const NOFILE = 2;
const KEYUNKNOWN = 3;
const MAXFILESREACHED = 4;
const MEGAERROR = 5;
const MAXKEYSREACHED = 6;

// The init function returns a custom createId function with the specified
// configuration. All configuration properties are optional.
const cuid = init({
  // A custom random function with the same API as Math.random.
  // You can use this to pass a cryptographically secure random function.
  random: Math.random,
  // the length of the id
  length: 10,
  // A custom fingerprint for the host environment. This is used to help
  // prevent collisions when generating ids in a distributed system.
  fingerprint: 'perspectives.is.great',
});

// Save the providedKeys object to file if any changes have been made.
function saveState()
{
  const currentNumberOfKeys = Object.keys(providedKeys).length;
  if (nrOfKeys < currentNumberOfKeys)
  {
    nrOfKeys = currentNumberOfKeys;
    fs.writeFileSync(statefile, providedKeys);
  }
}

// Returns a promise for an undefined value.
// Starts saving state periodically.
function readState()
{
  return readFile(statefile, {encoding: "utf-8"})
    .then( s => providedKeys = JSON.parse(s))
    // Periodically check and possibly save state (every 10 seconds)
    .then( () => setInterval( () => saveState(), 10000) );
}

// Start the server only after state has been read into `providedKeys`.
let server;
readState().then( () => {
  server = app.listen(port, () => {
    console.log('Server running on http://localhost:' + port);  
  })
});

// Graceful shutdown function
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  
  // Close the server (this will stop accepting new connections)
  server.close(() => {
    console.log('Closed remaining connections.');
    
    // Perform other cleanup actions here, e.g., closing DB connections
    saveState();

    // Exit the process
    process.exit(0);
  });

  // Forcefully exit if shutdown takes too long
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10-second timeout
};

// Handle termination signals
process.on('SIGTERM', gracefulShutdown); // External signal (e.g., Kubernetes)
process.on('SIGINT', gracefulShutdown);  // Ctrl+C in the terminal

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  gracefulShutdown();
});