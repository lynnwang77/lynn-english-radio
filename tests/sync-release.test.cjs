const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const {prepare}=require("../tools/prepare-sync-production.cjs");
const {syncConfiguration}=globalThis.LynnSync;
const firebase={
 projectId:"example-lynn-production",authDomain:"example-lynn-production.firebaseapp.com",
 apiKey:"AIza"+"a".repeat(35),messagingSenderId:"12345",appId:"1:12345:web:abc123"
};
const official={origin:"https://lynnwang77.github.io",pathname:"/lynn-english-radio/"};
const preview={origin:"https://preview.example",pathname:"/"};
const configured={mode:"production",firebase};
const testConfig={firebase:{projectId:"lynn-english-sync-test",authDomain:"lynn-english-sync-test.firebaseapp.com",
 apiKey:firebase.apiKey,messagingSenderId:firebase.messagingSenderId,appId:firebase.appId}};

test("production and preview cannot load each other's Firebase configuration",()=>{
 assert.equal(syncConfiguration(null,official),null);
 assert.deepEqual(syncConfiguration(configured,official),configured);
 assert.equal(syncConfiguration(testConfig,preview),testConfig);
 assert.throws(()=>syncConfiguration(testConfig,official));
 assert.throws(()=>syncConfiguration({...testConfig,mode:"production"},official));
 assert.throws(()=>syncConfiguration({...configured,emulator:true},official));
 assert.throws(()=>syncConfiguration(configured,{...official,pathname:"/other-site/"}));
 assert.throws(()=>syncConfiguration(configured,preview));
});

test("production artifacts embed only public Web config and isolate a single owner UID",()=>{
 const artifacts=prepare({...firebase,privateKey:"must never appear"},"owner");
 const context={window:{}};
 vm.runInNewContext(artifacts["sync-config.js"],context);
 assert.ok(artifacts["sync-config.js"].includes('"mode": "production"'));
 assert.equal(context.window.LynnSyncConfig.firebase.projectId,firebase.projectId);
 assert.ok(!artifacts["sync-config.js"].includes("privateKey"));
 assert.match(artifacts["firestore.rules"],/request\.auth\.uid == uid && uid == "owner"/);
 assert.throws(()=>prepare(testConfig.firebase,"owner"));
 assert.throws(()=>prepare(firebase,'uid" || true'));
});
