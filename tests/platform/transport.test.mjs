import test from 'node:test';import assert from 'node:assert/strict';import {publicAddress} from '../../desktop/network-transport.mjs';
test('proxy IP pinning blocks private, loopback, link-local and mapped addresses',()=>{
 for(const value of ['127.0.0.1','10.1.2.3','172.20.0.1','192.168.1.1','169.254.1.1','100.64.1.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1'])assert.equal(publicAddress(value),false,value);
 for(const value of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(publicAddress(value),true,value);
});
