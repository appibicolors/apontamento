import QRCode from "qrcode";

export async function downloadOrderQr(numeroOp:string,pcp:string){
  const payload=`OP:${numeroOp}|PCP:${pcp}`;
  const qr=await QRCode.toDataURL(payload,{width:520,margin:2,errorCorrectionLevel:"M",color:{dark:"#10213b",light:"#ffffff"}});
  const canvas=document.createElement("canvas");
  canvas.width=720;canvas.height=860;
  const context=canvas.getContext("2d");
  if(!context)throw new Error("O navegador não conseguiu gerar a etiqueta.");
  context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
  context.strokeStyle="#10213b";context.lineWidth=6;context.strokeRect(12,12,696,836);
  context.fillStyle="#10213b";context.textAlign="center";context.font="700 30px Arial";context.fillText("IBICOLORS · APONTAMENTO",360,62);
  const image=new Image();image.src=qr;await image.decode();context.drawImage(image,100,90,520,520);
  context.font="700 62px Arial";context.fillText(`OP ${numeroOp}`,360,675);
  context.font="28px Arial";context.fillText(`PCP: ${pcp}`,360,727);
  context.font="22px Arial";context.fillStyle="#536074";context.fillText("Leia este código no posto de trabalho",360,780);
  const link=document.createElement("a");link.download=`OP-${numeroOp}-QR.png`;link.href=canvas.toDataURL("image/png");link.click();
}
