const cluster = require('cluster');
const workers = [];
const cpus = require('os').cpus().length;
const port = 3003;
const clients = {};
const net = require('net');
const farmhash = require('farmhash');
const express = require('express');
//const redis = require('socket.io-redis');
const socketio = require('socket.io');
const path = require('path');
const memored = require('memored');
const circularjson = require('circular-json');
const jwt = require('jsonwebtoken');
const NATS = require('nats');

var nats = NATS.connect({json: true, url: "nats://localhost:4222"});
if(cluster.isMaster){
    console.log('Master started process id', process.pid);

    for(let i=0;i<cpus;i++){
        workers.push( cluster.fork());
        console.log('worker strated '+workers[i].id);

        workers[i].on('disconnect',() => {
            console.log('worker '+ workers[i].id+'died');
        });

        // handling process.send message events in master
        workers[i].on('message',(msg) => {
            if(msg.cmd==='newOrder'){
                console.log("master is notified about new message by worker",workers[i].id);
                sendNewmessage(msg);
            } else if(msg.cmd==='getLocation'){
                console.log("master is notified about new message by worker",workers[i].id);
                sendNewmessage(msg);
            }
        })
    }

    // notifying all workers about new client
    sendNewmessage = (msg) => {
        workers[msg.workerID-1].send({
           ...msg 
        })
    }

    // get worker index based on Ip and total no of workers so that it can be tranferred to same worker
    const getWorker_index = (ip,len) => {
        return farmhash.fingerprint32(ip)%len;
    }

    // ceating TCP server
    const server = net.createServer({
        // seting pauseOnCOnnect to true , so that when  we receive a connection pause it
        // and send to corresponding worker
        pauseOnConnect: true 
    }, (connection) => {
        // We received a connection and need to pass it to the appropriate
        // worker. Get the worker for this connection's source IP and pass
        // it the connection. we use above defined getworker_index func for that
        const worker = workers[getWorker_index(connection.remoteAddress,cpus)];

        // send the connection to the worker and send resume it there using .resume()
        worker.send({
            cmd:'sticky-session'
        },connection);
    }).listen(port);


    process.on('SIGINT',() => {
        console.log('cleaning up master server...');
        server.close();
        memored.clean(() => {
            console.log('cleaned memory..');
        })
        process.exit(1);
    });

}
else{
    
    const app = express();

    const Expserver = app.listen(3004,'172.16.130.138');

    const io = socketio(Expserver);

    // setting redis adapter as message broker and for
    // inter communication of connected sockets
    //const socket_adapter = io.adapter(redis({ host: 'localhost', port: 6379 }));

    // Add a basic route – index page
    //app.use(express.static(path.resolve(__dirname,'../'+'client/build/')));

    //app.get('*', (req, res) => {
    //    res.sendFile(path.resolve(__dirname,'../client/build/index.html'));
    //  });

    // require('./routes/register')(app,cluster,clients);
    io.use(function(socket, next){
        if (socket.handshake.query && socket.handshake.query.token){

            if (socket.handshake.query.type == 'kurir') {
                jwt.verify(socket.handshake.query.token, '5fdd293f20c2a396b419cb39dc02b3034cbc5770', function(err, decoded) {
                    if(err) return next(new Error('Authentication Kurir Error'));
                        socket.decoded = decoded;
                        socket.auth_type = socket.handshake.query.type;
                        //console.log(socket);
                        next();
                    });
            }

            //next();

        } else {
            next(new Error('Authentication error'));
        }    
    })
    .on('connection', (socket) => {
        let newSocket = circularjson.stringify(socket);
        // let newSocket1 = new socketio( circularjson.parse(newSocket));
        console.log('client connected ..'+socket.id+'..cluster'+cluster.worker.id);
        var room = null;
    var sid;
        socket.on('createsession',(data) => {
            console.log('creating session for...',data);

            let user = null;
            // buat session
            if(socket.decoded && socket.decoded.id){
                let session = "kurir-" + socket.decoded.id;
                //let session = room + '#' + socket.handshake.query.type + '#' + socket.decoded.id;
                //let session = room + '#' + socket.handshake.query.type;

                console.log("session", session);
                memored.read(session, async function(err, val) {
                    if(val){
                        socket.emit('usernametaken',{err:'alreadyrunning',address:val.workerID});
                    }
                    else{
                        if(socket.decoded && (clients[session] || user)){
                            console.log('already session available for user.',clients[session].userid);
                            socket.emit('accessdenied',{err:'alreadyrunning',address:clients[session].workerID});
                        }
                        else{

                            // Simple Subscriber
                            sid = nats.subscribe(session, function(msg) {
                                process.send({
                                    cmd:'newOrder',
                                    session: session,
                                    action: msg.action,
                                    order_id: msg.order_id,
                                    data: msg,
                                    workerID : cluster.worker.id
                                })
                                console.log('Received a message: ' + msg.action);
                            });


                            console.log("in else adding user", user);
                            // adding to clients list
                            socket.session = session;
                            //socket.room = room;
                            socket.userid = socket.decoded.id;
                            //socket.clientIP = data.clientIP;
                            socket.workerID = cluster.worker.id;
                            clients[session] = socket;

                            // storing client-worker relation in memory
                            memored.store(session,{
                                //clientIP: data.clientIP,
                                //room: room,
                                workerID : cluster.worker.id
                            },() => {
                                console.log("*8stored in memory**");
                                memored.keys((err,keys) => {
                                    console.log('session created..available users',keys);
                                    socket.emit('accessgranted',keys);
                                    socket.broadcast.emit('newClientOnline',{
                                        session: session
                                    })
                                })                  
                            });
                        }
                    }
                })
            }

        });

        socket.on('disconnect', function() {
            //socket.leave(room)
            console.log('client disconnected...',socket.id);
            console.log('deleting client..');
            // notifying master about client disconnect 
            delete clients[socket.session];
            memored.remove(socket.session,()=>{
                console.log('client removed from memory');
            });
        nats.unsubscribe(sid);
            socket.broadcast.emit('clientOffline',socket.session);
        });

        /*socket.on('saveLocation', function(message){
            // getting mapped workerID from memory
            let to = socket.room + '#' + ((socket.handshake.query.type == 'kurir') ? 'customer' : 'kurir');
            mysql.location.update(socket.userid, message.lat, message.lng, Math.floor(new Date().getTime()/1000));

             memored.read(to,(err,val) => {
                 if(err){
                     console.log(err);
                 }
                 else{
                    if(val) {
                        //io.to(room).emit('newMessage', message);
                        //console.log(to);
                        // send message to mater..master will redirect
                        // to appropriate worker
                        waktu = new Date();
                        process.send({
                            cmd:'saveLocation',
                            to: to,
                            room: socket.handshake.query.room,
                            from: socket.handshake.query.type,
                            lat: message.lat,
                            lng: message.lng,
                            workerID : val.workerID
                        })

                        //mysql.chat.saveChat(socket.room, socket.handshake.query.type, message.message);
                    } else{
                        //  client offline suport---in dev
                        console.log('requested  client offline');
                        socket.emit('clientNotFound');
                     }
                 }
             })
        });*/
    });   

    // listning for message event sent by master to catch the connection and resume
    cluster.worker.on('message',(obj,data) => {
        switch(obj.cmd){
            case "sticky-session":
                Expserver.emit('connection',data);
                data.resume();
                break;

            case "newOrder":
                console.log("message handled by"+ cluster.worker.id);
                clients[obj.session].emit("newOrder",{
                    //data: obj.data,
                    action: obj.action,
                    order_id: obj.order_id
                });

                break;
            default: return;
        }            
    });

    // SIGINT handling cleaning open servers and processes
    process.on('SIGINT',() => {
        console.log('cleaning up process...');
        Expserver.close();
        process.exit(1);
    });
}
