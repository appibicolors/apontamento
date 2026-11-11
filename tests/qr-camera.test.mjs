import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseOpScan} from "../app/scanner.ts";

const source=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("QR da OP aceita o formato impresso e o número puro",()=>{
 assert.equal(parseOpScan("OP:271526|PCP:app.ibicolors@gmail.com"),"271526");
 assert.equal(parseOpScan(" 271526 "),"271526");
 assert.equal(parseOpScan("conteúdo sem OP"),"");
});

test("leitor usa câmera local, fallback ZXing e encerra todos os recursos",async()=>{
 const scanner=await source("../app/qr-camera-scanner.tsx");
 assert.match(scanner,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(scanner,/facingMode:\{ideal:"environment"\}/);
 assert.match(scanner,/BarcodeDetector/);
 assert.match(scanner,/import\("@zxing\/browser"\)/);
 assert.match(scanner,/parseOpScan\(raw\)/);
 assert.match(scanner,/handledRef\.current=true/);
 assert.match(scanner,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
 assert.match(scanner,/QR Code não reconhecido como Ordem de Produção\./);
 assert.doesNotMatch(scanner,/fetch\(|FormData|upload/i);
});

test("câmera alimenta os mesmos fluxos individual e agrupado",async()=>{
 const [individual,grouped]=await Promise.all([
  source("../app/pointing-screen.tsx"),
  source("../app/grouped-pointing.tsx")
 ]);
 assert.match(individual,/QrCameraScanner/);
 assert.match(individual,/confirmOrder\(undefined,value\)/);
 assert.match(individual,/onKeyDown=\{orderKey\}/);
 assert.match(grouped,/cameraMode/);
 assert.match(grouped,/resolveOrder\("initial",undefined,value\)/);
 assert.match(grouped,/onKeyDown=\{additionKey\}/);
 assert.match(grouped,/setCameraMode\("addition"\)/);
});
