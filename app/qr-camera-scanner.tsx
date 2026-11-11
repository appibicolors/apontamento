"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {parseOpScan} from "./scanner";

type Props={onDetected:(number:string)=>void;onClose:()=>void};
type ScannerControls={stop:()=>void};
type NativeDetector={detect:(source:HTMLVideoElement)=>Promise<Array<{rawValue?:string}>>};
type NativeDetectorConstructor={new(options:{formats:string[]}):NativeDetector;getSupportedFormats?:()=>Promise<string[]>};

function cameraMessage(error:unknown){
 const name=error instanceof DOMException?error.name:"";
 if(name==="NotAllowedError"||name==="SecurityError")return"Permissão da câmera negada. Libere o acesso no navegador ou use a digitação manual.";
 if(name==="NotFoundError"||name==="DevicesNotFoundError")return"Nenhuma câmera foi encontrada neste dispositivo. Use a digitação manual ou o leitor externo.";
 if(name==="NotReadableError"||name==="TrackStartError")return"A câmera está sendo utilizada por outro aplicativo. Feche-o e tente novamente.";
 if(name==="OverconstrainedError")return"A câmera selecionada não está disponível. Tente alternar a câmera.";
 return error instanceof Error?`Não foi possível abrir a câmera: ${error.message}`:"Não foi possível abrir a câmera. Use a digitação manual ou o leitor externo.";
}

export function QrCameraScanner({onDetected,onClose}:Props){
 const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null),controlsRef=useRef<ScannerControls|null>(null),timerRef=useRef<number|null>(null),handledRef=useRef(false),mountedRef=useRef(true),invalidRef=useRef("");
 const [error,setError]=useState(""),[starting,setStarting]=useState(true),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState<string|undefined>();
 const stop=useCallback(()=>{if(timerRef.current!==null){window.clearTimeout(timerRef.current);timerRef.current=null}controlsRef.current?.stop();controlsRef.current=null;streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;if(videoRef.current)videoRef.current.srcObject=null},[]);
 const accept=useCallback((raw:string)=>{if(handledRef.current)return;const number=parseOpScan(raw);if(!number){if(invalidRef.current!==raw){invalidRef.current=raw;setError("QR Code não reconhecido como Ordem de Produção.")}return}handledRef.current=true;stop();onDetected(number)},[onDetected,stop]);
 const start=useCallback(async(selected?:string)=>{stop();handledRef.current=false;invalidRef.current="";setError("");setStarting(true);try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Este navegador não oferece acesso à câmera.");
  const constraints:MediaStreamConstraints={audio:false,video:selected?{deviceId:{exact:selected}}:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}};
  const stream=await navigator.mediaDevices.getUserMedia(constraints);if(!mountedRef.current){stream.getTracks().forEach(track=>track.stop());return}streamRef.current=stream;
  const video=videoRef.current;if(!video)throw new Error("Visualizador da câmera indisponível.");video.srcObject=stream;await video.play();
  const cameras=(await navigator.mediaDevices.enumerateDevices()).filter(item=>item.kind==="videoinput");setDevices(cameras);const active=stream.getVideoTracks()[0]?.getSettings().deviceId;if(active)setDeviceId(active);
  const Detector=(window as unknown as {BarcodeDetector?:NativeDetectorConstructor}).BarcodeDetector;let native=false;
  if(Detector){const formats=await Detector.getSupportedFormats?.().catch(()=>[])??["qr_code"];native=formats.includes("qr_code");if(native){const detector=new Detector({formats:["qr_code"]});const scan=async()=>{if(handledRef.current||!mountedRef.current)return;try{const results=await detector.detect(video);if(results[0]?.rawValue)accept(results[0].rawValue)}catch{/* frame ainda não legível */}if(!handledRef.current)timerRef.current=window.setTimeout(scan,180)};scan()}}
  if(!native){const {BrowserQRCodeReader}=await import("@zxing/browser");if(handledRef.current||!mountedRef.current)return;const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:180,delayBetweenScanSuccess:500});controlsRef.current=await reader.decodeFromStream(stream,video,result=>{if(result)accept(result.getText())})}
 }catch(value){stop();if(mountedRef.current)setError(cameraMessage(value))}finally{if(mountedRef.current)setStarting(false)}},[accept,stop]);
 useEffect(()=>{mountedRef.current=true;const frame=window.requestAnimationFrame(()=>start());return()=>{window.cancelAnimationFrame(frame);mountedRef.current=false;stop()}},[start,stop]);
 function close(){stop();onClose()}
 function switchCamera(){if(devices.length<2)return;const current=Math.max(0,devices.findIndex(item=>item.deviceId===deviceId));const next=devices[(current+1)%devices.length];setDeviceId(next.deviceId);start(next.deviceId)}
 return <div className="qr-camera-backdrop" role="presentation"><section className="qr-camera" role="dialog" aria-modal="true" aria-labelledby="qr-camera-title"><header><div><p className="eyebrow">LEITURA PELA CÂMERA</p><h2 id="qr-camera-title">Ler QR Code da OP</h2></div><button type="button" onClick={close} aria-label="Fechar leitor da câmera">×</button></header><div className="qr-camera-preview"><video ref={videoRef} muted playsInline aria-label="Imagem ao vivo da câmera"/><div className="qr-camera-frame" aria-hidden="true"/><span>{starting?"Abrindo câmera…":"Aponte a câmera para o QR Code da OP"}</span></div>{error&&<p className="qr-camera-error" role="alert">{error}</p>}<footer>{devices.length>1&&<button type="button" className="qr-camera-switch" onClick={switchCamera} disabled={starting}>↻ Alternar câmera</button>}<button type="button" className="qr-camera-close" onClick={close}>Fechar e digitar manualmente</button></footer></section></div>
}
