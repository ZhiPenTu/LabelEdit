import net from 'node:net';
import dgram from 'node:dgram';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

export async function assertRendererNetworkBlocked(evaluate) {
 let tcpConnections=0,udpPackets=0;
 const sockets=new Set();
 const tcp=net.createServer(socket=>{tcpConnections++;sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 const udp=dgram.createSocket('udp4');udp.on('message',()=>udpPackets++);
 await new Promise(resolve=>tcp.listen(0,'127.0.0.1',resolve));
 await new Promise(resolve=>udp.bind(0,'127.0.0.1',resolve));
 const ports={tcp:tcp.address().port,udp:udp.address().port};
 try {
  // Establish real host controls, so an unavailable listener cannot cause a
  // false pass when checking the renderer's UDP/STUN and TCP/TURN routes.
  await new Promise((resolve,reject)=>{const socket=net.connect(ports.tcp,'127.0.0.1');socket.once('error',reject);socket.once('connect',()=>{socket.end();resolve();});});
  for(let i=0;tcpConnections<1 && i<100;i++)await delay(10);
  assert.equal(tcpConnections,1,'the host must reach the TCP control listener');
  await new Promise((resolve,reject)=>{udp.once('message',resolve);const control=dgram.createSocket('udp4');control.send('fixture',ports.udp,'127.0.0.1',error=>{control.close();if(error)reject(error);});});
  assert.equal(udpPackets,1,'the host must reach the UDP control listener');
  await evaluate(async ports=>{
   const peer=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:'+ports.udp},{urls:'turn:127.0.0.1:'+ports.tcp+'?transport=tcp',username:'fixture',credential:'fixture'}]});
   try {
    peer.createDataChannel('fixture');await peer.setLocalDescription(await peer.createOffer());
    await new Promise(resolve=>{const timer=setTimeout(resolve,1800);peer.onicegatheringstatechange=()=>{if(peer.iceGatheringState==='complete'){clearTimeout(timer);resolve();}};});
   }finally {peer.close();}
  },ports);
  assert.equal(tcpConnections,1,'plugin WebRTC must not bypass the network broker through TCP');
  assert.equal(udpPackets,1,'plugin WebRTC must not bypass the network broker through UDP');
 }finally {for(const socket of sockets)socket.destroy();await new Promise(resolve=>tcp.close(resolve));await new Promise(resolve=>udp.close(resolve));}
}
