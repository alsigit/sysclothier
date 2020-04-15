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

const app = express();
const Expserver = app.listen(3004,'172.16.130.138');
const nats = NATS.connect({json: true, url: "nats://localhost:4222"});
const io = socketio(Expserver);
var sid;

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
        } else if (socket.handshake.query.type == 'customer') {
            jwt.verify(socket.handshake.query.token, 'ab928c61f60280c55a19f7990d31b93a7d891106', function(err, decoded) {
                console.log(err);
                if(err) return next(new Error('Authentication Customer Error'));
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
    console.log('client connected ..'+socket.id);
    var room = null;

    socket.on('createsession',(data) => {
        console.log('creating session for...',data);

        let user = null;
        let session = null;
        // buat session
        if(socket.decoded && socket.decoded.id){
            if (socket.auth_type == 'kurir') {
                session = "kurir-" + socket.decoded.id;
            } else if (socket.auth_type == 'customer') {
                session = 'customer-' + socket.decoded.id;
            }
            //let session = room + '#' + socket.handshake.query.type + '#' + socket.decoded.id;
            //let session = room + '#' + socket.handshake.query.type;

            console.log("session", session);

            if (session in clients) {
                console.log(session + ' sudah ada ...');
            } else {
                socket.session = session;
                //socket.room = room;
                socket.userid = socket.decoded.id;
                //socket.clientIP = data.clientIP;
                //socket.workerID = cluster.worker.id;
                clients[session] = socket;
            }
            /*imemored.read(session, async function(err, val) {
                if(val){
                    socket.emit('usernametaken',{err:'alreadyrunning',address:val.workerID});
                }
                else{
                    if(socket.decoded && (clients[session] || user)){
                        console.log('already session available for user.',clients[session].userid);
                        socket.emit('accessdenied',{err:'alreadyrunning',address:clients[session].workerID});
                    }
                    else{
                        console.log("in else adding user", user);
                        // adding to clients list
                        socket.session = session;
                        //socket.room = room;
                        socket.userid = socket.decoded.id;
                        //socket.clientIP = data.clientIP;
                        //socket.workerID = cluster.worker.id;
                        clients[session] = socket;

                        // storing client-worker relation in memory
                        memored.store(session,{
                            //clientIP: data.clientIP,
                            //room: room,
                            //workerID : cluster.worker.id
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
            })*/
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
        //socket.broadcast.emit('clientOffline',socket.session);
    });
});
// Simple Subscriber
sid = nats.subscribe('order', function(msg) {
    console.log(msg);
    if (msg.action == 'orderLDR') {
        if (msg.to in clients) {
            clients[msg.to].emit("newOrder",{
                //data: obj.data,
                action: msg.action,
                order_id: msg.order_id
            });
        }
    } else if (msg.action == 'updateOrder') {
        if (msg.to in clients) {
            clients[msg.to].emit("newOrder",{
                //data: obj.data,
                action: msg.action,
                order_id: msg.order_id,
                status: msg.status
            });
        }
        
    }  else if (msg.action == 'LDRAccepted') {
        if (msg.to in clients) {
            clients[msg.to].emit("newOrder",{
                //data: obj.data,
                action: msg.action,
                order_id: msg.order_id,
                status: msg.status
            });
        }
        
    } else if (msg.action == 'hideLDR') {
        if (msg.to in clients) {
            clients[msg.to].emit("newOrder",{
                //data: obj.data,
                action: msg.action,
                order_id: msg.order_id,
                data: msg,
            });
        }      
    } else if (msg.action == 'LDRFinish') {
        if (msg.to in clients) {
            clients[msg.to].emit("newOrder",{
                //data: obj.data,
                action: "LDRFinish2",
                order_id: msg.order_id,
                status: msg.status,
                data: msg,
            });
        }
    }
});
