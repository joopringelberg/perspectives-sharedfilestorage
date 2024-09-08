# perspectives-sharedfilestorage
A relay service to store media files in a cloud service, that can be called from the MyContexts client.

If the users of two MyContexts installations want to share a media file, they cannot exchange that file through the message broker service they use to synchronise role- and context data. Instead, such files must be shared _by reference_. The reference - also called **claim data** - is synchronised as a property. The media file itself (that can be 'claimed') must be stored in a location that is accessible to both parties. Here we call that a 'cloud service'. Each installation should add credentials for a personal cloud service that allows peers to access a file stored by the owner, given a URL. 

The Perspectives Project recommends using the Mega cloud (https://mega.nz). It provides a generous free entry level account.

However, to give new users a head start and a feel for what it is to share media files through MyContexts, we provide each new user with a 'courtesy' number of uploads to a cloud service that is maintained by the Perspectives Project. We call that storage PPSharedFileStorage. This, too, is based on a Mega account.

Each installation would require the credentials of that account. This clearly is undesirable. Therefore we maintain this small service that acts as a relay server for new MyContexts installations. They upload their files to this service, which relays them to the Mega cloud. This is the `perspectives-sharedfilestorage` package whose README you are reading right now.

The MyContexts client limits the number of free uploads. However, we also have the relay service limit the number of uploads. We would like to make sure that only MyContexts installations use this service. This is not entirely possible due to the distributed nature of MyContexts. Instead, we base the usage of the service on the principle of the trusted network that is formed by MyContexts peers. Assuming the bona fide nature of any peer within the network, we ensure that a new user can only use perspectives-sharedfilestorage when spoken for by a peer who is already in the network. This is accounted for by some modelling in `model://perspectives.domains#System`. On the side of the service this requires two entry points:

* `/ppsfs/getsharedfileserverkey`, with a payload {key: <String>}, that returns a key (a CUID2 identifier)
* `/ppsfs/uploadfile`, with a payload {key, file}, that returns a success or failure message in case the maximum number of uploads for the key has been reached before.

Clarification: the key that is sent along with `getsharedfileserverkey` is the key of a peer already in the trusted network; the key that is sent back is a new key that is given to a new peer. Obviously, `uploadfile` requires the peers own key.

## Apache
Apache must be configured to pass any request to these endpoints to the locally listening `perspectives-sharedfilestorage`. Here is a suitable Apache conf section:

```
    <Location "/ppsfs>
      ProxyPass http://localhost:5988
    </Location>
```

Notice that the given port should be the port configured with runtime parameter `--port` (in this example taken to be 5988).

## Parameters of the service
The parameter `--port` gives the port on which the service should listen.

The parameter `--maxfiles` gives the maximum number of files any user can upload.

The parameter `--maxkeys` gives the maximum number of keys any keyholder can request.

The parameter `--userid` gives the name of the Mega account that is used to access the cloud, while `--password` gives the corresponding password. Obviously, these two credentials are never shared with clients!

To access the server, create a POST request and send a payload consisting of this object:

```
{ key :: String, file :: File Object}
```

## Installing
Install using npm:

```
npm install git+https://github.com/joopringelberg/perspectives-sharedfilestorage.git
```

## Starting the server manually
An example of starting the service manually can be found in the shell script `startservice.sh`.

## Making the service a deamon with pm2
To make sure that the service is restarted after system boot, install [pm2](https://www.npmjs.com/package/pm2) on the server. Then start this service through pm2 like this:

```
pm2 start sharedfilestorage.js -- --port=15673 --maxfiles=10 --maxkeys=100 --userid=user@example.com --password=secret
```

## Developing
For https://mycontexts.com, the three source files can be copied to `/home/joop/ppsfs` with the package script `publish`.

Start the service from that directory using

```
./startService.sh
```
