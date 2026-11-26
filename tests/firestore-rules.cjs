const fs=require("node:fs");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {collection,doc,getDoc,getDocs,setDoc,deleteDoc}=require("firebase/firestore");
(async()=>{
 const env=await initializeTestEnvironment({projectId:"demo-lynn-sync",
  firestore:{rules:fs.readFileSync("firestore.rules","utf8")}});
 try{
  const owner=env.authenticatedContext("owner",{email_verified:true}).firestore();
  const other=env.authenticatedContext("other",{email_verified:true}).firestore();
  const unverified=env.authenticatedContext("owner",{email_verified:false}).firestore();
  const guest=env.unauthenticatedContext().firestore();
  const id="00000000-0000-4000-8000-000000000001";
  const ref=(db)=>doc(db,"syncUsers","owner","changes",id);
  const change={id,key:'["favorites","test"]',parents:[],payload:"true"};
  await assertSucceeds(setDoc(ref(owner),change));
  await assertSucceeds(getDoc(ref(owner)));
  for(const db of [other,unverified,guest]){
   await assertFails(getDoc(ref(db)));
   await assertFails(getDocs(collection(db,"syncUsers","owner","changes")));
   await assertFails(setDoc(doc(db,"syncUsers","owner","changes","00000000-0000-4000-8000-000000000002"),{...change,id:"00000000-0000-4000-8000-000000000002"}));
  }
  await assertFails(setDoc(ref(owner),{...change,payload:"null"}));
  await assertFails(deleteDoc(ref(owner)));
  console.log("Firestore rules: authenticated owner allowed; cross-account, guest, unverified, overwrite and delete denied");
 }finally{await env.cleanup()}
})().catch(error=>{console.error(error);process.exitCode=1});
